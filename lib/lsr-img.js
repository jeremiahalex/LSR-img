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
var highlightImage = '/lib/static/src/statics/lsr-highlight.png';
var damagedImage = '/lib/static/src/statics/broken_file.svg';


var falsy = /^(?:f(?:alse)?|no?|0+)$/i;

function isTrue(value) {
  return !falsy.test(value) && !!value;
}

function getWidth(element) {
  return element.getBoundingClientRect().width > 0 ? element.getBoundingClientRect().width : parseInt(window.getComputedStyle(element).width);
}

function getHeight(element) {
  return element.getBoundingClientRect().height > 0 ? element.getBoundingClientRect().height : parseInt(window.getComputedStyle(element).height);
}

export function LSRImg() {
  var loadOnDemand = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;


  var lsrImages = [];
  var lsrImgElements = [];
  var lsrHighlightImagePath = null;
  var focussedLsrCanvas = null;
  var lsrHighlightImage = highlightImage;
  var lsrShadowPadding = 50;
  var lsrFocussedPadding = 35;
  var lsrResizeTimer = void 0;
  var lsrMinAngleX = -10;
  var lsrMinAngleY = -10;
  var lsrAngleYCorrector = 1;
  var lsrAngleRange = 20;
  var lsrDeviceOrientation = null;
  var lsrAxisTable = {
    landscape: {
      x: 'gamma', y: 'beta', z: 'alpha'
    }, landscapeInverse: {
      x: 'gamma', y: 'beta', z: 'alpha'
    }, portrait: {
      x: 'beta', y: 'gamma', z: 'alpha'
    }
  };
  var onloadCallback = emptyOnload;
  var onerrorCallback = emptyOnerror;

  function emptyOnload() {}
  function emptyOnerror() {}

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
        var _lsrImgElements = document.getElementsByClassName('lsr-img');
        var _iteratorNormalCompletion = true;
        var _didIteratorError = false;
        var _iteratorError = undefined;

        try {
          for (var _iterator = _lsrImgElements[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
            var lsrImgElement = _step.value;

            loadLSRFile(lsrImgElement);
          }
        } catch (err) {
          _didIteratorError = true;
          _iteratorError = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion && _iterator.return) {
              _iterator.return();
            }
          } finally {
            if (_didIteratorError) {
              throw _iteratorError;
            }
          }
        }
      }
    };
  }

  function _load(elementOrId) {
    if (loadOnDemand) {
      if (typeof elementOrId === 'string') {
        var lsrElement = document.getElementById(elementOrId);
        if (lsrElement !== null) {
          elementOrId = lsrElement;
        } else {
          throw 'LSR-img: the element identified with ID: ' + elementOrId + ', was not found.';
        }
      }

      if (lsrImgElements.indexOf(elementOrId) !== -1) {
        removeLsrImage(elementOrId);
      } else {
        lsrImgElements.push(elementOrId);
      }

      loadLSRFile(elementOrId);
    } else {
      console.log('LSR-img: load on demand is disable.');
    }
  }

  function resizeLSRCanvases() {
    for (var i = 0; i < lsrImages.length; i++) {
      if (lsrImages[i].responsive && lsrImages[i].canvas.parentElement.getBoundingClientRect().width > 0 && lsrImages[i].canvas.parentElement.getBoundingClientRect().height > 0) {
        resizeLSRCanvas(lsrImages[i]);
      }
    }
  }

  function resizeLSRCanvas(lsrImage) {
    var ratio = lsrImage.canvasSize.width / lsrImage.canvasSize.height;

    //we scale the css, so we don't need to redo the canvas content
    lsrImage.canvas.style.width = getWidth(lsrImage.canvas.parentElement) + 'px';
    lsrImage.canvas.style.height = getWidth(lsrImage.canvas.parentElement) / ratio + 'px';
  }

  /*------------------------------
    File Loading -
  ------------------------------*/
  function loadLSRFile(element) {
    try {
      //grab the lsr-image name from the div
      var dataAttribute = element.dataset.imageSrc;
      if (dataAttribute !== null) {
        var filename = String(dataAttribute);

        //if the filename isn't absolute then, take the window's location for the relative path
        if (filename.indexOf('http') === -1) {
          var filePath = String(window.location);
          filePath = filePath.substr(0, filePath.lastIndexOf('/') + 1);
          filename = filePath + filename;
        }

        var xhr = new XMLHttpRequest();
        xhr.open('GET', filename, true);
        xhr.responseType = 'blob';
        xhr.onload = function () {
          if (this.status === 200) {
            var fileBlob = new Blob([this.response], { type: 'application/zip' });
            unzipLSRFile(fileBlob).then(function (lsrImage) {
              //obtain the settings for this image
              dataAttribute = element.dataset.rounded;
              if (typeof dataAttribute === 'undefined') lsrImage.roundedCorners = false;else lsrImage.roundedCorners = isTrue(dataAttribute);
              //shadows
              dataAttribute = element.dataset.shadows;
              if (typeof dataAttribute === 'undefined') lsrImage.drawShadows = true;else lsrImage.drawShadows = isTrue(dataAttribute);
              //animate
              dataAttribute = element.dataset.animate;
              if (typeof dataAttribute === 'undefined') lsrImage.animate = false;else lsrImage.animate = isTrue(dataAttribute);
              //focussed
              dataAttribute = element.dataset.zoom;
              if (typeof dataAttribute === 'undefined') lsrImage.zoomEnabled = true;else lsrImage.zoomEnabled = isTrue(dataAttribute);
              //responsive
              dataAttribute = element.dataset.responsive;
              if (typeof dataAttribute === 'undefined') lsrImage.responsive = false;else lsrImage.responsive = isTrue(dataAttribute);

              //display the image
              displayLSRImage(lsrImage, element);
              onloadCallback();
            }).catch(function (error) {
              drawDamagedImage(element);
              onerrorCallback(error);
            });
          }
        };
        xhr.onreadystatechange = function () {
          if (xhr.readyState === XMLHttpRequest.DONE) {
            if (xhr.status !== 200) {
              drawDamagedImage(element);
              onerrorCallback(new Error('LSR-img: The following LSR file could not be loaded: ' + filename));
            }
          }
        };

        xhr.send();
      } else {
        drawDamagedImage(element);
        onerrorCallback(new Error('LSR-img: data-image-src attribute not found on lsr-img classed object'));
      }
    } catch (error) {
      drawDamagedImage(element);
      onerrorCallback(error);
    }
  }

  function unzipLSRFile(blob) {
    return JSZip.loadAsync(blob).then(function (zip) {
      //find out the lsr file content
      return zip.file('Contents.json').async('string').then(function (content) {
        var lsrImage = JSON.parse(content);
        var openImages = new Array(lsrImage.layers.length);
        for (var i = 0; i < lsrImage.layers.length; i++) {
          openImages[i] = openLSRLayer(lsrImage.layers[i], zip);
        }
        return Promise.all(openImages).then(function () {
          lsrImages.push(lsrImage);
          return Promise.resolve(lsrImage);
        });
      });
    });
  }

  function openLSRLayer(lsrImageLayer, zip) {
    return zip.file(lsrImageLayer.filename + '/Contents.json').async('string').then(function (content) {
      var json = JSON.parse(content);
      lsrImageLayer.info = json.info;
      lsrImageLayer.properties = json.properties;
      return openLSRImageSet(lsrImageLayer, zip);
    });
  }

  function openLSRImageSet(lsrImageLayer, zip) {
    var entryName = lsrImageLayer.filename + '/Content.imageset/Contents.json';
    return zip.file(entryName).async('string').then(function (content) {
      var json = JSON.parse(content);
      lsrImageLayer.images = json.images;
      //currently only one image set available
      if (lsrImageLayer.images.length > 0) {
        return openImage(lsrImageLayer.images[0], lsrImageLayer.filename + '/Content.imageset/' + lsrImageLayer.images[0].filename, zip);
      } else {
        return Promise.reject(new Error('LSR-img: No Images specified in the layer: ' + entryName));
      }
    });
  }

  function openImage(lsrLayerImage, entryName, zip) {
    var ext = entryName.substr(entryName.lastIndexOf('.') + 1);
    if (ext.match(/(jpg|jpeg|png|gif)$/)) {
      var mimeType = 'image/' + ext;
      return zip.file(entryName).async('base64').then(function (content) {
        lsrLayerImage.fileData = 'data:' + mimeType + ';base64,' + content;
      });
    } else {
      return Promise.reject(new Error('LSR-img: Layered Image had an unsupported File Type: ' + entryName));
    }
  }

  /*------------------------------
    Image Display -
  ------------------------------*/
  function displayLSRImage(lsrImage, element) {
    lsrImage.canvasResizeRatio = 1.0;
    if (lsrImage.responsive) {
      var wRatio = lsrImage.properties.canvasSize.width / getWidth(element);
      var hRatio = lsrImage.properties.canvasSize.height / getHeight(element);
      lsrImage.canvasResizeRatio = wRatio > hRatio ? wRatio : hRatio;
    }

    //for rendering we add padding to the canvas size for shadows and centering on focus
    lsrImage.canvasSize = {
      width: lsrImage.properties.canvasSize.width + lsrShadowPadding * 2 * lsrImage.canvasResizeRatio,
      height: lsrImage.properties.canvasSize.height + lsrShadowPadding * 2 * lsrImage.canvasResizeRatio
    };

    var canvas = document.createElement('canvas');
    canvas.setAttribute('class', 'lsr-canvas');
    canvas.setAttribute('width', lsrImage.canvasSize.width / lsrImage.canvasResizeRatio);
    canvas.setAttribute('height', lsrImage.canvasSize.height / lsrImage.canvasResizeRatio);
    lsrImage.canvas = canvas;

    //create a canvas to render the shadow on
    var shadowCanvas = document.createElement('canvas');
    shadowCanvas.setAttribute('width', lsrImage.canvasSize.width / lsrImage.canvasResizeRatio);
    shadowCanvas.setAttribute('height', lsrImage.canvasSize.height / lsrImage.canvasResizeRatio);
    lsrImage.shadowCanvas = shadowCanvas;
    lsrImage.shadowCtx = lsrImage.shadowCanvas.getContext('2d');

    lsrImage.properties.canvasCentre = {};
    lsrImage.properties.canvasCentre.x = lsrImage.properties.canvasSize.width * 0.5;
    lsrImage.properties.canvasCentre.y = lsrImage.properties.canvasSize.height * 0.5;

    lsrImage.focussedSize = {};
    lsrImage.unfocussedSize = {};
    var unfocusedReduction = lsrFocussedPadding * 2;
    var aspectRatio = lsrImage.properties.canvasSize.width / lsrImage.properties.canvasSize.height;
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

    var loadCount = 0;
    for (var i = 0; i < lsrImage.layers.length; i++) {
      var img = new Image();
      lsrImage.layers[i].img = img;
      img.onload = function () {
        ++loadCount;
        if (loadCount === lsrImage.layers.length) {

          //hide the placeholder image now that we have our canvas
          element.appendChild(lsrImage.canvas);
          drawLSRImage(lsrImage, 0, 0);
          var _iteratorNormalCompletion2 = true;
          var _didIteratorError2 = false;
          var _iteratorError2 = undefined;

          try {
            for (var _iterator2 = element.getElementsByClassName('lsr-placeholder')[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
              var placeholder = _step2.value;

              placeholder.style.display = 'none';
            }
          } catch (err) {
            _didIteratorError2 = true;
            _iteratorError2 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion2 && _iterator2.return) {
                _iterator2.return();
              }
            } finally {
              if (_didIteratorError2) {
                throw _iteratorError2;
              }
            }
          }

          if (lsrImage.responsive) resizeLSRCanvas(lsrImage);
          if (lsrImage.animate) animateLSRImage(new Date().getTime(), lsrImage);
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

  var requestLSRAnimFrame = function () {
    return window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || window.oRequestAnimationFrame || window.msRequestAnimationFrame || function (callback) {
      window.setTimeout(callback, 1000 / 60);
    };
  }();

  function animateLSRImage(startTime, lsrImage) {
    if (!lsrImage.focussed) lsrImage.focussed = true;

    var time = new Date().getTime() - startTime;

    // let speed = 500;
    var theta = time / 500;

    var relX = Math.cos(theta);
    var relY = Math.sin(theta);

    //TODO- there is duplication across a few of used thse poisitioning functions, so they should be a refactored
    var rotateAroundX = -relX;
    var rotateAroundY = relY;

    var panX = -relX;
    var panY = relY;

    drawLSRImage(lsrImage, panX, panY);
    rotateLSRCanvas(lsrImage, rotateAroundX, rotateAroundY);

    requestLSRAnimFrame(function () {
      animateLSRImage(startTime, lsrImage);
    });
  }

  function resetLSRCanvasRotation(lsrImage) {
    rotateLSRCanvas(lsrImage, 0, 0);
  }

  function lsrClamp(val, min, max) {
    if (val > max) return max;
    if (val < min) return min;
    return val;
  }

  function lsrOrientationChange() {
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

  function lsrOrientationUpdate(e) {
    if (lsrDeviceOrientation == null) lsrOrientationChange(null);

    var x = e[lsrAxisTable[lsrDeviceOrientation].x];
    var y = e[lsrAxisTable[lsrDeviceOrientation].y] * lsrAngleYCorrector;

    var relX = lsrClamp((x - lsrMinAngleX) / lsrAngleRange, 0, 1);
    var relY = lsrClamp((y - lsrMinAngleY) / lsrAngleRange, 0, 1);

    var rotateAroundX = relX * 2 - 1;
    var rotateAroundY = relY * 2 - 1;
    var panX = relY * 2 - 1;
    var panY = relX * 2 - 1;

    for (var n = 0; n < lsrImages.length; n++) {
      drawLSRImage(lsrImages[n], panX, panY);
      rotateLSRCanvas(lsrImages[n], -rotateAroundX, rotateAroundY);
    }
  }

  function mouseMoveOverFocusedLSRImage(e) {
    var parentRect = focussedLsrCanvas.canvas.getBoundingClientRect();
    var relX = e.pageX - parentRect.left;
    var relY = e.pageY - parentRect.top;

    relX = 1 / parentRect.width * relX;
    relY = 1 / parentRect.height * relY;

    var rotateAroundX = relY * 2 - 1;
    var rotateAroundY = relX * 2 - 1;

    var panX = 1 - relX * 2;
    var panY = 1 - relY * 2;

    drawLSRImage(focussedLsrCanvas, panX, panY);
    rotateLSRCanvas(focussedLsrCanvas, rotateAroundX, -rotateAroundY);
  }

  function rotateLSRCanvas(lsrImage, degreeX, degreeY) {
    var perspective = 0;

    if (degreeX !== 0 || degreeY !== 0) perspective = 1000;

    degreeX *= 3;
    degreeY *= 3;

    var parentCSS = lsrImage.canvas.parentElement.style;
    parentCSS['-webkit-perspective'] = perspective + 'px';
    parentCSS['-moz-perspective'] = perspective + 'px';
    parentCSS['-ms-perspective'] = perspective + 'px';
    parentCSS['-o-perspective'] = perspective + 'px';
    parentCSS['-perspective'] = perspective + 'px';

    var canvasCSS = lsrImage.canvas.style;
    canvasCSS['-webkit-transform'] = ' rotateY(' + degreeY + 'deg)' + ' rotateX(' + degreeX + 'deg)';
    canvasCSS['-moz-transform'] = ' rotateY(' + degreeY + 'deg)' + ' rotateX(' + degreeX + 'deg)';
    canvasCSS['-ms-transform'] = ' rotateY(' + degreeY + 'deg)' + ' rotateX(' + degreeX + 'deg)';
    canvasCSS['-o-transform'] = ' rotateY(' + degreeY + 'deg)' + ' rotateX(' + degreeX + 'deg)';
    canvasCSS['-transform'] = ' rotateY(' + degreeY + 'deg)' + ' rotateX(' + degreeX + 'deg)';
  }

  //TODO. lots of opportunity for optimisation in this function
  function drawLSRImage(lsrImage, relX, relY) {
    lsrImage.ctx.clearRect(0, 0, lsrImage.canvasSize.width / lsrImage.canvasResizeRatio, lsrImage.canvasSize.height / lsrImage.canvasResizeRatio);
    lsrImage.ctx.globalCompositeOperation = 'source-over';

    var focusScale = void 0;
    var focusOffset = {};
    if (lsrImage.focussed || !lsrImage.zoomEnabled) {
      focusScale = lsrImage.focussedScale;
      focusOffset.x = lsrImage.focussedOffset.x;
      focusOffset.y = lsrImage.focussedOffset.y;
    } else {
      focusScale = lsrImage.unfocussedScale;
      focusOffset.x = lsrImage.unfocussedOffset.x;
      focusOffset.y = lsrImage.unfocussedOffset.y;
    }

    var max = lsrImage.layers.length - 1;
    var scalePerLayer = 0.06 / max;

    // TODO: turning off image smoothing sharpens the image but creates lines in animation and poor resuls when scaling, to invesitgate
    // lsrImage.ctx.mozImageSmoothingEnabled = false;
    // lsrImage.ctx.webkitImageSmoothingEnabled = false;
    // lsrImage.ctx.msImageSmoothingEnabled = false;
    // lsrImage.ctx.imageSmoothingEnabled = false;

    for (var i = max; i >= 0; --i) {
      var x = focusOffset.x,
          y = focusOffset.y;
      var sizeScale = focusScale;

      //TODO. the default value should probably be calculated as a proportion of the width/height or padding
      var _panOffset = { x: relX * 15, y: relY * 10 };

      //increase the scale for each layer
      if (lsrImage.focussed || !lsrImage.zoomEnabled) sizeScale += (max - i) * scalePerLayer;

      var width = lsrImage.layers[i].properties['frame-size'].width * sizeScale;
      var height = lsrImage.layers[i].properties['frame-size'].height * sizeScale;

      if (typeof lsrImage.layers[i].properties['frame-center'] !== 'undefined') {
        x += lsrImage.layers[i].properties['frame-center'].x * focusScale;
        y += lsrImage.layers[i].properties['frame-center'].y * focusScale;
      } else {
        x += lsrImage.properties.canvasCentre.x * focusScale;
        y += lsrImage.properties.canvasCentre.y * focusScale;
      }

      //as we move up the layers the further from the center, the more pronounced the move
      if (lsrImage.focussed || !lsrImage.zoomEnabled) {
        var distfromCenter = {
          x: lsrImage.properties.canvasCentre.x - lsrImage.layers[i].properties['frame-center'].x,
          y: lsrImage.properties.canvasCentre.y - lsrImage.layers[i].properties['frame-center'].y
        };

        //TODO. these numbers seem to work, would be good to have a better rationale behind them though
        x -= distfromCenter.x * 0.03 * (max - i);
        y -= distfromCenter.y * 0.03 * (max - i);

        _panOffset.x += lsrImage.canvasSize.width * 0.003 * i * relX;
        _panOffset.y += lsrImage.canvasSize.width * 0.003 * i * relY;
      }

      // adjust with the pan
      x -= width * 0.5 + _panOffset.x;
      y -= height * 0.5 + _panOffset.y;

      width /= lsrImage.canvasResizeRatio;
      height /= lsrImage.canvasResizeRatio;
      x /= lsrImage.canvasResizeRatio;
      y /= lsrImage.canvasResizeRatio;

      lsrImage.ctx.drawImage(lsrImage.layers[i].img, x, y, width, height);
    }

    // calculate baseRect take into account the lsrImage.canvasSize.
    var panOffset = { x: relX * 15, y: relY * 10 };
    if (lsrImage.focussed || !lsrImage.zoomEnabled) {
      panOffset.x += lsrImage.canvasSize.width * 0.003 * max * relX;
      panOffset.y += lsrImage.canvasSize.width * 0.003 * max * relY;
    }
    var baseRect = {};
    baseRect.width = lsrImage.properties.canvasSize.width * focusScale;
    baseRect.height = lsrImage.properties.canvasSize.height * focusScale;
    baseRect.x = focusOffset.x + lsrImage.properties.canvasCentre.x * focusScale - (baseRect.width * 0.5 + panOffset.x);
    baseRect.y = focusOffset.y + lsrImage.properties.canvasCentre.y * focusScale - (baseRect.height * 0.5 + panOffset.y);
    baseRect.width /= lsrImage.canvasResizeRatio;
    baseRect.height /= lsrImage.canvasResizeRatio;
    baseRect.x /= lsrImage.canvasResizeRatio;
    baseRect.y /= lsrImage.canvasResizeRatio;

    //add the highlight
    if (lsrHighlightImage !== null && (lsrImage.focussed || !lsrImage.zoomEnabled)) {
      var _x2 = lsrImage.focussedSize.width * ((1 - relX) * 0.5) - lsrImage.focussedSize.width * 0.5;
      var _y = lsrImage.focussedSize.height * ((1 - relY) * 0.5) - lsrImage.focussedSize.width * 0.6;
      lsrImage.ctx.drawImage(lsrHighlightImage, _x2 / lsrImage.canvasResizeRatio, _y / lsrImage.canvasResizeRatio, lsrImage.focussedSize.width / lsrImage.canvasResizeRatio, lsrImage.focussedSize.width / lsrImage.canvasResizeRatio);
    }

    //finally we draw our frame and crop
    if (lsrImage.roundedCorners) {
      var radius = 10;
      lsrImage.ctx.fillStyle = '#fff';
      lsrImage.ctx.globalCompositeOperation = 'destination-in';
      lsrImage.ctx.beginPath();
      lsrImage.ctx.moveTo(baseRect.x + radius, baseRect.y);
      lsrImage.ctx.lineTo(baseRect.x + baseRect.width - radius, baseRect.y);
      lsrImage.ctx.quadraticCurveTo(baseRect.x + baseRect.width, baseRect.y, baseRect.x + baseRect.width, baseRect.y + radius);
      lsrImage.ctx.lineTo(baseRect.x + baseRect.width, baseRect.y + baseRect.height - radius);
      lsrImage.ctx.quadraticCurveTo(baseRect.x + baseRect.width, baseRect.y + baseRect.height, baseRect.x + baseRect.width - radius, baseRect.y + baseRect.height);
      lsrImage.ctx.lineTo(baseRect.x + radius, baseRect.y + baseRect.height);
      lsrImage.ctx.quadraticCurveTo(baseRect.x, baseRect.y + baseRect.height, baseRect.x, baseRect.y + baseRect.height - radius);
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
      lsrImage.shadowCtx.clearRect(0, 0, lsrImage.canvasSize.width / lsrImage.canvasResizeRatio, lsrImage.canvasSize.height / lsrImage.canvasResizeRatio);

      var indent = 10;
      var shadowSize = lsrImage.focussed || !lsrImage.zoomEnabled ? lsrShadowPadding * 0.5 : lsrShadowPadding * 0.25;
      lsrImage.shadowCtx.beginPath();
      lsrImage.shadowCtx.fillStyle = '#000';
      lsrImage.shadowCtx.rect(baseRect.x + indent * 0.5, baseRect.y + indent * 0.5, baseRect.width - indent, baseRect.height - indent);
      lsrImage.shadowCtx.shadowBlur = shadowSize;
      lsrImage.shadowCtx.shadowColor = lsrImage.focussed ? '#666' : '#999';
      lsrImage.shadowCtx.shadowOffsetX = 0;
      lsrImage.shadowCtx.shadowOffsetY = shadowSize * 0.5;
      lsrImage.shadowCtx.closePath();
      lsrImage.shadowCtx.fill();

      lsrImage.ctx.globalCompositeOperation = 'destination-over';
      lsrImage.ctx.drawImage(lsrImage.shadowCanvas, 0, 0);
    }
  }

  function removeLsrImage(element) {
    var index = lsrImages.findIndex(function (lsrImage) {
      return lsrImage.canvas.parentElement === element;
    });
    if (index !== -1) {
      element.removeChild(lsrImages[index].canvas);
      lsrImages.splice(index, 1);
    }
  }

  function drawDamagedImage(element) {
    damagedImage.style.width = '100%';
    damagedImage.style.height = 'auto';
    damagedImage.alt = 'Damaged LSR Image';
    damagedImage.title = 'Damaged LSR Image';
    element.appendChild(damagedImage);
    var _iteratorNormalCompletion3 = true;
    var _didIteratorError3 = false;
    var _iteratorError3 = undefined;

    try {
      for (var _iterator3 = element.getElementsByClassName('lsr-placeholder')[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
        var placeholder = _step3.value;

        placeholder.style.display = 'none';
      }
    } catch (err) {
      _didIteratorError3 = true;
      _iteratorError3 = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion3 && _iterator3.return) {
          _iterator3.return();
        }
      } finally {
        if (_didIteratorError3) {
          throw _iteratorError3;
        }
      }
    }
  }

  return {
    setHighlightImage: function setHighlightImage(imgPath) {
      lsrHighlightImagePath = imgPath;
    },
    load: function load(elementOrId) {
      _load(elementOrId);
    },
    onload: function onload(callback) {
      if (callback !== null && callback !== undefined) {
        onloadCallback = callback;
      } else {
        onloadCallback = emptyOnload;
      }
    },
    onerror: function onerror(callback) {
      if (callback !== null && callback !== undefined) {
        onerrorCallback = callback;
      } else {
        onerrorCallback = emptyOnerror();
      }
    },
    version: version
  };
}