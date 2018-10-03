/* ===========================================================
 * lsr-img.js v0.1
 * http://jeremiahalex.github.com
 *
 * Web previewer for Apple's Layer Source Representation (LSR) Image format.
 * Requires
 * - JSZip
 *
 * ===========================================================
 * Copyright 2015 Jeremiah Alexander (@JeremiahAlex)
 *
 * Licensed under the MIT license.
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * ========================================================== */
import { version } from '../package.json';
import JSZip from 'jszip';
import highlightImage from './statics/lsr-highlight.png';

let falsy = /^(?:f(?:alse)?|no?|0+)$/i;

function isTrue (value) {
  return !falsy.test(value) && !!value;
}

function getWidth (element) {
  return element.getBoundingClientRect().width > 0 ?
    element.getBoundingClientRect().width :
    parseInt(window.getComputedStyle(element).width);
}

function getHeight (element) {
  return element.getBoundingClientRect().height > 0 ?
    element.getBoundingClientRect().height :
    parseInt(window.getComputedStyle(element).height);
}

export function LSRImg (loadOnDemand = false) {

  let lsrImages = [];
  let lsrImgElements = [];
  let lsrHighlightImagePath = null;
  let focussedLsrCanvas = null;
  let lsrHighlightImage = highlightImage;
  let lsrShadowPadding = 50;
  let lsrFocussedPadding = 35;
  let lsrResizeTimer;
  let lsrMinAngleX = -10;
  let lsrMinAngleY = -10;
  let lsrAngleYCorrector = 1;
  let lsrAngleRange = 20;
  let lsrDeviceOrientation = null;
  let lsrAxisTable = {
    landscape: {
      x: 'gamma', y: 'beta', z: 'alpha',
    }, landscapeInverse: {
      x: 'gamma', y: 'beta', z: 'alpha',
    }, portrait: {
      x: 'beta', y: 'gamma', z: 'alpha',
    },
  };
  let onloadCallback = emptyOnload;

  function emptyOnload () {}


  /*------------------------------
    Initialize -
  ------------------------------*/
  // create a highlight image
  if (lsrHighlightImagePath !== null) {
    lsrHighlightImage = new Image();
    lsrHighlightImage.src = lsrHighlightImagePath;
  }

  // check if device rotation is supported
  if (window.DeviceOrientationEvent) {
    window.addEventListener('orientationchange', lsrOrientationChange, false);
    window.addEventListener('deviceorientation', lsrOrientationUpdate, false);
  }

  // catch resize events but not too often
  window.onresize = function () {
    if (lsrResizeTimer) {
      clearTimeout(lsrResizeTimer);
    }
    lsrResizeTimer = setTimeout(resizeLSRCanvases, 500);
  };

  if (!loadOnDemand) {
    document.onreadystatechange = function () {
      if (document.readyState === 'complete') {
        let lsrImgElements = document.getElementsByClassName('lsr-img');
        for (let lsrImgElement of lsrImgElements) {
          loadLSRFile(lsrImgElement);
        }
      }
    };
  }

  function load (elementOrId) {
    if (loadOnDemand) {
      if (typeof elementOrId === 'string') {
        let lsrElement = document.getElementById(elementOrId);
        if (lsrElement !== null) {
          elementOrId = lsrElement;
        } else {
          console.log('LSR-img: the element identified with ID: ' + elementOrId + ', was not found.');
          return;
        }
      }

      if (lsrImgElements.indexOf(elementOrId) !== -1) {
        removeLsrImage(elementOrId);
      }
      else {
        lsrImgElements.push(elementOrId);
      }

      loadLSRFile(elementOrId);
    } else {
      console.log('LSR-img: load on demand is disable.');
    }
  }

  function resizeLSRCanvases () {
    for (let i = 0; i < lsrImages.length; i++) {
      if (lsrImages[i].responsive && lsrImages[i].canvas.parentElement.getBoundingClientRect().width > 0 &&
        lsrImages[i].canvas.parentElement.getBoundingClientRect().height > 0
      ) {
        resizeLSRCanvas(lsrImages[i]);
      }
    }
  }

  function resizeLSRCanvas (lsrImage) {
    let ratio = lsrImage.canvasSize.width / lsrImage.canvasSize.height;

    //we scale the css, so we don't need to redo the canvas content
    lsrImage.canvas.style.width = getWidth(lsrImage.canvas.parentElement) + 'px';
    lsrImage.canvas.style.height = (getWidth(lsrImage.canvas.parentElement) / ratio) + 'px';
  }

  /*------------------------------
    File Loading -
  ------------------------------*/
  function loadLSRFile (element) {
    //grab the lsr-image name from the div
    let dataAttribute = element.dataset.imageSrc;
    if (dataAttribute === null) {
      console.log('LSR-img: data-image-src attribute not found on lsr-img classed object');
      return;
    }
    let filename = String(dataAttribute);

    //if the filename isn't absolute then, then take the window's location for the relative path
    if (filename.indexOf('http') === -1) {
      let filePath = String(window.location);
      filePath = filePath.substr(0, filePath.lastIndexOf('/') + 1);
      filename = filePath + filename;
    }

    let xhr = new XMLHttpRequest();
    xhr.open('GET', filename, true);
    xhr.responseType = 'blob';
    xhr.onload = function () {
      if (this.status === 200) {
        let fileBlob = new Blob([this.response], {type: 'application/zip'});
        unzipLSRFile(fileBlob, function (lsrImage) {
          //obtain the settings for this image
          dataAttribute = element.dataset.rounded;
          if (typeof dataAttribute === 'undefined') lsrImage.roundedCorners = false; else lsrImage.roundedCorners =
            isTrue(dataAttribute);
          //shadows
          dataAttribute = element.dataset.shadows;
          if (typeof dataAttribute === 'undefined') lsrImage.drawShadows = true; else lsrImage.drawShadows =
            isTrue(dataAttribute);
          //animate
          dataAttribute = element.dataset.animate;
          if (typeof dataAttribute === 'undefined') lsrImage.animate = false; else lsrImage.animate =
            isTrue(dataAttribute);
          //focussed
          dataAttribute = element.dataset.zoom;
          if (typeof dataAttribute === 'undefined') lsrImage.zoomEnabled = true; else lsrImage.zoomEnabled =
            isTrue(dataAttribute);
          //responsive
          dataAttribute = element.dataset.responsive;
          if (typeof dataAttribute === 'undefined') lsrImage.responsive = false; else lsrImage.responsive =
            isTrue(dataAttribute);

          //display the image
          displayLSRImage(lsrImage, element);
          onloadCallback();
        });
      }
    };
    xhr.onreadystatechange = function () {
      if (xhr.readyState === XMLHttpRequest.DONE) {
        if (xhr.status !== 200) {
          console.log('LSR-img: The following LSR file could not be loaded: ' + filename);
        }
      }
    };

    xhr.send();
  }

  function unzipLSRFile (blob, successCallback) {
    JSZip.loadAsync(blob).then(function (zip) {
      //find out the lsr file content
      zip.file('Contents.json').async('string').then(function success (content) {
        let lsrImage = JSON.parse(content);
        lsrImages.push(lsrImage);
        lsrImage.layersLoading = lsrImage.layers.length;
        for (let i = 0; i < lsrImage.layers.length; i++) {
          openLSRLayer(lsrImage.layers[i], zip, function (success) {
            lsrImage.layersLoading--;
            if (!success)
              console.log('LSR-img: One or more errors attempting to load lsr layer: ' + lsrImage.layers[i].filename);

            if (lsrImage.layersLoading === 0) {
              successCallback(lsrImage);
            }
          });
        }
      }, function error () {
        console.log('LSR-Img: Failed to get Content.json');
      });
    }, function (message) {
      console.log('LSR-img: Failed to unzip the LSR file: ' + message);
    });
  }

  function openLSRLayer (lsrImageLayer, zip, successCallback) {
    zip.file(lsrImageLayer.filename + '/Contents.json').async('string').then(function (content) {
      let json = JSON.parse(content);
      lsrImageLayer.info = json.info;
      lsrImageLayer.properties = json.properties;
      openLSRImageSet(lsrImageLayer, zip, successCallback);
    });
  }

  function openLSRImageSet (lsrImageLayer, zip, successCallback) {
    let entryName = lsrImageLayer.filename + '/Content.imageset/Contents.json';
    zip.file(entryName).async('string').then(function (content) {
      let json = JSON.parse(content);
      lsrImageLayer.images = json.images;
      //currently only one image set available
      if (lsrImageLayer.images.length > 0) {
        openImage(lsrImageLayer.images[0],
          lsrImageLayer.filename + '/Content.imageset/' + lsrImageLayer.images[0].filename, zip, successCallback);
      } else {
        console.log('LSR-img: No Images specified in the layer: ' + entryName);
        successCallback(false);
      }
    });
  }

  function openImage (lsrLayerImage, entryName, zip, successCallback) {
    let ext = entryName.substr(entryName.lastIndexOf('.') + 1);
    if (ext.match(/(jpg|jpeg|png|gif)$/)) {
      let mimeType = 'image/' + ext;
      zip.file(entryName).async('base64').then(function (content) {
        lsrLayerImage.fileData = 'data:' + mimeType + ';base64,' + content;
        successCallback(true);
      });
    } else {
      console.log('LSR-img: Layered Image had an unsupported File Type: ' + entryName);
      successCallback(false);
    }
  }

  /*------------------------------
    Image Display -
  ------------------------------*/
  function displayLSRImage (lsrImage, element) {
    lsrImage.canvasResizeRatio = 1.0;
    if (lsrImage.responsive) {
      let wRatio = lsrImage.properties.canvasSize.width / getWidth(element);
      let hRatio = lsrImage.properties.canvasSize.height / getHeight(element);
      lsrImage.canvasResizeRatio = wRatio > hRatio ? wRatio : hRatio;
    }

    //for rendering we add padding to the canvas size for shadows and centering on focus
    lsrImage.canvasSize = {
      width: lsrImage.properties.canvasSize.width + (lsrShadowPadding * 2 * lsrImage.canvasResizeRatio),
      height: lsrImage.properties.canvasSize.height + (lsrShadowPadding * 2 * lsrImage.canvasResizeRatio),
    };

    let canvas = document.createElement('canvas');
    canvas.setAttribute('class', 'lsr-canvas');
    canvas.setAttribute('width', lsrImage.canvasSize.width / lsrImage.canvasResizeRatio);
    canvas.setAttribute('height', lsrImage.canvasSize.height / lsrImage.canvasResizeRatio);
    lsrImage.canvas = canvas;

    //create a canvas to render the shadow on
    let shadowCanvas = document.createElement('canvas');
    shadowCanvas.setAttribute('width', lsrImage.canvasSize.width / lsrImage.canvasResizeRatio);
    shadowCanvas.setAttribute('height', lsrImage.canvasSize.height / lsrImage.canvasResizeRatio);
    lsrImage.shadowCanvas = shadowCanvas;
    lsrImage.shadowCtx = lsrImage.shadowCanvas.getContext('2d');

    lsrImage.properties.canvasCentre = {};
    lsrImage.properties.canvasCentre.x = lsrImage.properties.canvasSize.width * 0.5;
    lsrImage.properties.canvasCentre.y = lsrImage.properties.canvasSize.height * 0.5;

    lsrImage.focussedSize = {};
    lsrImage.unfocussedSize = {};
    let unfocusedReduction = lsrFocussedPadding * 2;
    let aspectRatio = lsrImage.properties.canvasSize.width / lsrImage.properties.canvasSize.height;
    if (lsrImage.properties.canvasSize.width > lsrImage.properties.canvasSize.height) {
      lsrImage.focussedSize.width = lsrImage.properties.canvasSize.width / 1.06;
      lsrImage.unfocussedSize.width = lsrImage.focussedSize.width - unfocusedReduction;

      lsrImage.focussedSize.height = lsrImage.focussedSize.width / aspectRatio;
      lsrImage.unfocussedSize.height = lsrImage.unfocussedSize.width / aspectRatio;
      lsrImage.focussedScale = 1 / lsrImage.properties.canvasSize.width * lsrImage.focussedSize.width;
      lsrImage.unfocussedScale = 1 / lsrImage.properties.canvasSize.width * lsrImage.unfocussedSize.width;
    } else {
      lsrImage.focussedSize.height = lsrImage.properties.canvasSize.height / 1.06;
      lsrImage.unfocussedSize.height = lsrImage.focussedSize.height - unfocusedReduction;

      lsrImage.focussedSize.width = lsrImage.focussedSize.height * aspectRatio;
      lsrImage.unfocussedSize.width = lsrImage.unfocussedSize.height * aspectRatio;
      lsrImage.focussedScale = 1 / lsrImage.properties.canvasSize.height * lsrImage.focussedSize.height;
      lsrImage.unfocussedScale = 1 / lsrImage.properties.canvasSize.height * lsrImage.unfocussedSize.height;
    }
    lsrImage.focussedOffset = {};
    lsrImage.focussedOffset.x = (lsrImage.canvasSize.width - lsrImage.focussedSize.width) * 0.5;
    lsrImage.focussedOffset.y = (lsrImage.canvasSize.height - lsrImage.focussedSize.height) * 0.5;
    lsrImage.unfocussedOffset = {};
    lsrImage.unfocussedOffset.x = (lsrImage.canvasSize.width - lsrImage.unfocussedSize.width) * 0.5;
    lsrImage.unfocussedOffset.y = (lsrImage.canvasSize.height - lsrImage.unfocussedSize.height) * 0.5;

    lsrImage.ctx = lsrImage.canvas.getContext('2d');

    let loadCount = 0;
    for (let i = 0; i < lsrImage.layers.length; i++) {
      let img = new Image();
      lsrImage.layers[i].img = img;
      img.onload = function () {
        ++loadCount;
        if (loadCount === lsrImage.layers.length) {

          //hide the placeholder image now that we have our canvas
          element.appendChild(lsrImage.canvas);
          drawLSRImage(lsrImage, 0, 0);
          for (let placeholder of element.getElementsByClassName('lsr-placeholder')) {
            placeholder.style.display = 'none';
          }
          if (lsrImage.responsive) resizeLSRCanvas(lsrImage);
          if (lsrImage.animate) animateLSRImage((new Date()).getTime(), lsrImage);
        }
      };
      //for now all LSR images only have 1 image per layer, so load index 0
      img.src = lsrImage.layers[i].images[0].fileData;
    }

    if (!lsrImage.animate) {
      lsrImage.canvas.onmouseenter = function () {
        if (!lsrImage.focussed) {
          lsrImage.focussed = true;
          if (focussedLsrCanvas !== null) {
            focussedLsrCanvas.focussed = false;
            drawLSRImage(focussedLsrCanvas, 0, 0);
            resetLSRCanvasRotation(focussedLsrCanvas);
            focussedLsrCanvas.canvas.removeEventListener('mousemove', mouseMoveOverFocusedLSRImage);
          }
          focussedLsrCanvas = lsrImage;
          focussedLsrCanvas.canvas.onmousemove = mouseMoveOverFocusedLSRImage;

          drawLSRImage(lsrImage, 0, 0);
        }
      };
      lsrImage.canvas.onmouseleave = function () {
        if (lsrImage.focussed) {
          focussedLsrCanvas = null;
          lsrImage.focussed = false;
          lsrImage.canvas.removeEventListener('mousemove', mouseMoveOverFocusedLSRImage);

          drawLSRImage(lsrImage, 0, 0);
          resetLSRCanvasRotation(lsrImage);
        }
      };

      if (window.DeviceOrientationEvent) {
        //make it auto focussed for now by disabling zoom. in the future we could extend to be based on scroll visability
        lsrImage.zoomEnabled = false;
      }
    }
  }

  let requestLSRAnimFrame = (function () {
    return window.requestAnimationFrame ||
      window.webkitRequestAnimationFrame ||
      window.mozRequestAnimationFrame ||
      window.oRequestAnimationFrame ||
      window.msRequestAnimationFrame ||
      function (callback) {
        window.setTimeout(callback, 1000 / 60);
      };
  })();

  function animateLSRImage (startTime, lsrImage) {
    if (!lsrImage.focussed) lsrImage.focussed = true;

    let time = (new Date()).getTime() - startTime;

    // let speed = 500;
    let theta = time / 500;

    let relX = Math.cos(theta);
    let relY = Math.sin(theta);

    //TODO- there is duplication across a few of used thse poisitioning functions, so they should be a refactored
    let rotateAroundX = -relX;
    let rotateAroundY = relY;

    let panX = -relX;
    let panY = relY;

    drawLSRImage(lsrImage, panX, panY);
    rotateLSRCanvas(lsrImage, rotateAroundX, rotateAroundY);

    requestLSRAnimFrame(function () {
      animateLSRImage(startTime, lsrImage);
    });
  }

  function resetLSRCanvasRotation (lsrImage) {
    rotateLSRCanvas(lsrImage, 0, 0);
  }

  function lsrClamp (val, min, max) {
    if (val > max) return max;
    if (val < min) return min;
    return val;
  }

  function lsrOrientationChange () {
    if (window.orientation === 0) {
      lsrDeviceOrientation = 'portrait';
      lsrAngleRange = 20;
      lsrMinAngleY = -10;
    } else {
      //less rotation on landscape
      lsrDeviceOrientation = window.orientation === -90 ? 'landscapeInverse' : 'landscape';
      lsrAngleRange = 10;
      lsrMinAngleY = -5;
    }

    lsrMinAngleX = window.orientation === 90 ? lsrMinAngleY - 45 : lsrMinAngleY + 45;
    lsrAngleYCorrector = window.orientation === -90 ? -1 : 1;
  }

  function lsrOrientationUpdate (e) {
    if (lsrDeviceOrientation == null) lsrOrientationChange(null);

    let x = e[lsrAxisTable[lsrDeviceOrientation].x];
    let y = e[lsrAxisTable[lsrDeviceOrientation].y] * lsrAngleYCorrector;

    let relX = lsrClamp((x - lsrMinAngleX) / lsrAngleRange, 0, 1);
    let relY = lsrClamp((y - lsrMinAngleY) / lsrAngleRange, 0, 1);

    let rotateAroundX = relX * 2 - 1;
    let rotateAroundY = relY * 2 - 1;
    let panX = relY * 2 - 1;
    let panY = relX * 2 - 1;

    for (let n = 0; n < lsrImages.length; n++) {
      drawLSRImage(lsrImages[n], panX, panY);
      rotateLSRCanvas(lsrImages[n], -rotateAroundX, rotateAroundY);
    }
  }

  function mouseMoveOverFocusedLSRImage (e) {
    let parentRect = focussedLsrCanvas.canvas.getBoundingClientRect();
    let relX = e.pageX - parentRect.left;
    let relY = e.pageY - parentRect.top;

    relX = 1 / parentRect.width * relX;
    relY = 1 / parentRect.height * relY;

    let rotateAroundX = relY * 2 - 1;
    let rotateAroundY = relX * 2 - 1;

    let panX = 1 - relX * 2;
    let panY = 1 - relY * 2;

    drawLSRImage(focussedLsrCanvas, panX, panY);
    rotateLSRCanvas(focussedLsrCanvas, rotateAroundX, -rotateAroundY);
  }

  function rotateLSRCanvas (lsrImage, degreeX, degreeY) {
    let perspective = 0;

    if (degreeX !== 0 || degreeY !== 0) perspective = 1000;

    degreeX *= 3;
    degreeY *= 3;

    let parentCSS = lsrImage.canvas.parentElement.style;
    parentCSS['-webkit-perspective'] = perspective + 'px';
    parentCSS['-moz-perspective'] = perspective + 'px';
    parentCSS['-ms-perspective'] = perspective + 'px';
    parentCSS['-o-perspective'] = perspective + 'px';
    parentCSS['-perspective'] = perspective + 'px';

    let canvasCSS = lsrImage.canvas.style;
    canvasCSS['-webkit-transform'] = ' rotateY(' + degreeY + 'deg)' + ' rotateX(' + degreeX + 'deg)';
    canvasCSS['-moz-transform'] = ' rotateY(' + degreeY + 'deg)' + ' rotateX(' + degreeX + 'deg)';
    canvasCSS['-ms-transform'] = ' rotateY(' + degreeY + 'deg)' + ' rotateX(' + degreeX + 'deg)';
    canvasCSS['-o-transform'] = ' rotateY(' + degreeY + 'deg)' + ' rotateX(' + degreeX + 'deg)';
    canvasCSS['-transform'] = ' rotateY(' + degreeY + 'deg)' + ' rotateX(' + degreeX + 'deg)';
  }

  //TODO. lots of opportunity for optimisation in this function
  function drawLSRImage (lsrImage, relX, relY) {
    lsrImage.ctx.clearRect(0, 0, lsrImage.canvasSize.width / lsrImage.canvasResizeRatio,
      lsrImage.canvasSize.height / lsrImage.canvasResizeRatio);
    lsrImage.ctx.globalCompositeOperation = 'source-over';

    let focusScale;
    let focusOffset = {};
    if (lsrImage.focussed || !lsrImage.zoomEnabled) {
      focusScale = lsrImage.focussedScale;
      focusOffset.x = lsrImage.focussedOffset.x;
      focusOffset.y = lsrImage.focussedOffset.y;
    } else {
      focusScale = lsrImage.unfocussedScale;
      focusOffset.x = lsrImage.unfocussedOffset.x;
      focusOffset.y = lsrImage.unfocussedOffset.y;
    }

    let max = lsrImage.layers.length - 1;
    let scalePerLayer = 0.06 / max;

    // TODO: turning off image smoothing sharpens the image but creates lines in animation and poor resuls when scaling, to invesitgate
    // lsrImage.ctx.mozImageSmoothingEnabled = false;
    // lsrImage.ctx.webkitImageSmoothingEnabled = false;
    // lsrImage.ctx.msImageSmoothingEnabled = false;
    // lsrImage.ctx.imageSmoothingEnabled = false;

    for (let i = max; i >= 0; --i) {
      let x = focusOffset.x, y = focusOffset.y;
      let sizeScale = focusScale;

      //TODO. the default value should probably be calculated as a proportion of the width/height or padding
      let panOffset = {x: relX * 15, y: relY * 10};

      //increase the scale for each layer
      if (lsrImage.focussed || !lsrImage.zoomEnabled) sizeScale += (max - i) * scalePerLayer;

      let width = lsrImage.layers[i].properties['frame-size'].width * sizeScale;
      let height = lsrImage.layers[i].properties['frame-size'].height * sizeScale;

      if (typeof lsrImage.layers[i].properties['frame-center'] !== 'undefined') {
        x += lsrImage.layers[i].properties['frame-center'].x * focusScale;
        y += lsrImage.layers[i].properties['frame-center'].y * focusScale;
      } else {
        x += lsrImage.properties.canvasCentre.x * focusScale;
        y += lsrImage.properties.canvasCentre.y * focusScale;
      }

      //as we move up the layers the further from the center, the more pronounced the move
      if (lsrImage.focussed || !lsrImage.zoomEnabled) {
        let distfromCenter = {
          x: lsrImage.properties.canvasCentre.x - lsrImage.layers[i].properties['frame-center'].x,
          y: lsrImage.properties.canvasCentre.y - lsrImage.layers[i].properties['frame-center'].y,
        };

        //TODO. these numbers seem to work, would be good to have a better rationale behind them though
        x -= distfromCenter.x * 0.03 * (max - i);
        y -= distfromCenter.y * 0.03 * (max - i);

        panOffset.x += (lsrImage.canvasSize.width * 0.003) * i * relX;
        panOffset.y += (lsrImage.canvasSize.width * 0.003) * i * relY;
      }

      // adjust with the pan
      x -= width * 0.5 + panOffset.x;
      y -= height * 0.5 + panOffset.y;

      width /= lsrImage.canvasResizeRatio;
      height /= lsrImage.canvasResizeRatio;
      x /= lsrImage.canvasResizeRatio;
      y /= lsrImage.canvasResizeRatio;

      lsrImage.ctx.drawImage(lsrImage.layers[i].img, x, y, width, height);
    }

    // calculate baseRect take into account the lsrImage.canvasSize.
    let panOffset = {x: relX * 15, y: relY * 10};
    if (lsrImage.focussed || !lsrImage.zoomEnabled) {
      panOffset.x += (lsrImage.canvasSize.width * 0.003) * max * relX;
      panOffset.y += (lsrImage.canvasSize.width * 0.003) * max * relY;
    }
    let baseRect = {};
    baseRect.width = lsrImage.properties.canvasSize.width * focusScale;
    baseRect.height = lsrImage.properties.canvasSize.height * focusScale;
    baseRect.x =
      focusOffset.x + (lsrImage.properties.canvasCentre.x * focusScale) - (baseRect.width * 0.5 + panOffset.x);
    baseRect.y =
      focusOffset.y + (lsrImage.properties.canvasCentre.y * focusScale) - (baseRect.height * 0.5 + panOffset.y);
    baseRect.width /= lsrImage.canvasResizeRatio;
    baseRect.height /= lsrImage.canvasResizeRatio;
    baseRect.x /= lsrImage.canvasResizeRatio;
    baseRect.y /= lsrImage.canvasResizeRatio;

    //add the highlight
    if (lsrHighlightImage !== null && (lsrImage.focussed || !lsrImage.zoomEnabled)) {
      let x = lsrImage.focussedSize.width * ((1 - relX) * 0.5) - lsrImage.focussedSize.width * 0.5;
      let y = lsrImage.focussedSize.height * ((1 - relY) * 0.5) - lsrImage.focussedSize.width * 0.6;
      lsrImage.ctx.drawImage(
        lsrHighlightImage,
        x / lsrImage.canvasResizeRatio,
        y / lsrImage.canvasResizeRatio,
        lsrImage.focussedSize.width / lsrImage.canvasResizeRatio,
        lsrImage.focussedSize.width / lsrImage.canvasResizeRatio);
    }

    //finally we draw our frame and crop
    if (lsrImage.roundedCorners) {
      let radius = 10;
      lsrImage.ctx.fillStyle = '#fff';
      lsrImage.ctx.globalCompositeOperation = 'destination-in';
      lsrImage.ctx.beginPath();
      lsrImage.ctx.moveTo(baseRect.x + radius, baseRect.y);
      lsrImage.ctx.lineTo(baseRect.x + baseRect.width - radius, baseRect.y);
      lsrImage.ctx.quadraticCurveTo(baseRect.x + baseRect.width, baseRect.y, baseRect.x + baseRect.width,
        baseRect.y + radius);
      lsrImage.ctx.lineTo(baseRect.x + baseRect.width, baseRect.y + baseRect.height - radius);
      lsrImage.ctx.quadraticCurveTo(baseRect.x + baseRect.width, baseRect.y + baseRect.height,
        baseRect.x + baseRect.width - radius, baseRect.y + baseRect.height);
      lsrImage.ctx.lineTo(baseRect.x + radius, baseRect.y + baseRect.height);
      lsrImage.ctx.quadraticCurveTo(baseRect.x, baseRect.y + baseRect.height, baseRect.x,
        baseRect.y + baseRect.height - radius);
      lsrImage.ctx.lineTo(baseRect.x, baseRect.y + radius);
      lsrImage.ctx.quadraticCurveTo(baseRect.x, baseRect.y, baseRect.x + radius, baseRect.y);
      lsrImage.ctx.closePath();
      lsrImage.ctx.fill();
    } else {
      lsrImage.ctx.fillStyle = '#fff';
      lsrImage.ctx.globalCompositeOperation = 'destination-in';
      lsrImage.ctx.beginPath();
      lsrImage.ctx.rect(baseRect.x, baseRect.y, baseRect.width, baseRect.height);
      lsrImage.ctx.closePath();
      lsrImage.ctx.fill();
    }

    //add some shadows
    if (lsrImage.drawShadows) {
      lsrImage.shadowCtx.clearRect(0, 0, lsrImage.canvasSize.width / lsrImage.canvasResizeRatio,
        lsrImage.canvasSize.height / lsrImage.canvasResizeRatio);

      let indent = 10;
      let shadowSize = (lsrImage.focussed || !lsrImage.zoomEnabled) ? lsrShadowPadding * 0.5 : lsrShadowPadding * 0.25;
      lsrImage.shadowCtx.beginPath();
      lsrImage.shadowCtx.fillStyle = '#000';
      lsrImage.shadowCtx.rect(baseRect.x + indent * 0.5, baseRect.y + indent * 0.5, baseRect.width - indent,
        baseRect.height - indent);
      lsrImage.shadowCtx.shadowBlur = shadowSize;
      lsrImage.shadowCtx.shadowColor = lsrImage.focussed ? '#666' : '#999';
      lsrImage.shadowCtx.shadowOffsetX = 0;
      lsrImage.shadowCtx.shadowOffsetY = (shadowSize * 0.5);
      lsrImage.shadowCtx.closePath();
      lsrImage.shadowCtx.fill();

      lsrImage.ctx.globalCompositeOperation = 'destination-over';
      lsrImage.ctx.drawImage(lsrImage.shadowCanvas, 0, 0);
    }
  }

  function removeLsrImage (element) {
    let index = lsrImages.findIndex(lsrImage => { return lsrImage.canvas.parentElement === element; });
    if (index !== -1) {
      element.removeChild(lsrImages[index].canvas);
      lsrImages.splice(index, 1);
    }
  }


  return {
    setHighlightImage: function (imgPath) {
      lsrHighlightImagePath = imgPath;
    },
    load: function (elementOrId) {
      load(elementOrId);
    },
    onload: function (callback) {
      if (callback !== null && callback !== undefined) {
        onloadCallback = callback;
      } else {
        onloadCallback = emptyOnload;
      }
    },
    version: version,
  };

}
