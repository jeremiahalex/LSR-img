/* ===========================================================
 * lsr-img.js v0.1
 * http://jeremiahalex.github.com
 * 
 * Web previewer for Apple's Layer Source Representation (LSR) Image format. 
 * Requires
 * - Jquery
 * - zip.js (inc. worker.js, inflator.js)
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

var LSR_IMG = (function(self){
	
	var version = '0.1';

	var lsrImages = [];
	var scriptsFolder = 'js/';
	var lsrHighlightImagePath = "img/lsr-highlight.png";
	var focussedLsrCanvas = null;
	var lsrHighlightImage = null;
	var lsrShadowPadding = 50;
	var lsrFocussedPadding = 35;
	var lsrResizeTimer;
	var lsrMinAngleX = -10;
	var lsrMinAngleY = -10;
	var lsrAngleYCorrector = 1;
	var lsrAngleRange = 20;
	var lsrDeviceOrientation = null;
	var lsrAxisTable = {
		landscape: {
			x: 'gamma',
			y: 'beta',
			z: 'alpha'
		},
		landscapeInverse: {
			x: 'gamma',
			y: 'beta',
			z: 'alpha'
		},
		portrait: {
			x: 'beta',
			y: 'gamma',
			z: 'alpha'
		}
	};
	
	/*------------------------------
		Initialize -
	------------------------------*/
	$(document).ready(function() {
		
		//set the folder for the zip
		zip.workerScriptsPath = scriptsFolder;
		
		$('.lsr-img').each(function() {
		    loadLSRFile($( this ));
		});
		
		//create a highlight image
		var filename = lsrHighlightImagePath;
		lsrHighlightImage = new Image();
		lsrHighlightImage.src = filename;
		
		//acheck if device rotation is supported
		if ( window.DeviceOrientationEvent )
		{
			window.addEventListener('orientationchange', lsrOrientationChange, false);
			window.addEventListener('deviceorientation', lsrOrientationUpdate, false);
		}
		
		//catch resize events but not too often
		$(window).resize(function() {
	        if(this.lsrResizeTimer) clearTimeout(this.lsrResizeTimer);
	        this.lsrResizeTimer = setTimeout( resizeLSRCanvases, 500);
	    });
	});
	
	function resizeLSRCanvases() {
		for ( var i = 0; i < lsrImages.length; i++ )
		{
			if ( lsrImages[i].responsive && lsrImages[i].canvas.parent().width() > 0 && lsrImages[i].canvas.parent().height() > 0 )
				resizeLSRCanvas(lsrImages[i]);
		}
	}
	function resizeLSRCanvas( lsrImage )
	{
		var ratio = lsrImage.canvasSize.width/lsrImage.canvasSize.height;
		
		//we scale the css, so we don't need to redo the canvas content
		lsrImage.canvas.css({
	        'width': (lsrImage.canvas.parent().width() + 'px'),
	        'height': ( (lsrImage.canvas.parent().width() / ratio) + 'px')
		}); 
	}
	
	/*------------------------------
		File Loading -
	------------------------------*/
	function loadLSRFile( element )
	{
		//grab the lsr-image name from the div
		var dataAttribute = element.data( "image-src" );
		if ( dataAttribute === null ){
			console.log("LSR-img: data-image-src attribute not found on lsr-img classed object");
			return;
		}
		var filename = String(dataAttribute);
			
		//if the filename isn't absolute then, then take the window's location for the relative path
		if ( filename.indexOf("http") == -1)
		{
			var filePath = String(window.location);
			filePath = filePath.substr( 0, filePath.lastIndexOf("/")+1 );
			filename = filePath + filename;
		}
		
		var xhr = new XMLHttpRequest();
		xhr.open("GET", filename, true);
		xhr.responseType = 'blob';
		xhr.onload = function(e) {
		  if (this.status == 200) {
		    var fileBlob = new Blob([this.response], {type: 'application/zip'});
			unzipLSRFile( fileBlob, function(lsrImage)
			{
				//obtain the settings for this image
				dataAttribute = element.data( "rounded" );
				if ( typeof dataAttribute === 'undefined' )
					lsrImage.roundedCorners = false;
				else 
					lsrImage.roundedCorners = dataAttribute == true;
				//shadows
				dataAttribute = element.data( "shadows" );
				if ( typeof dataAttribute === 'undefined' )
					lsrImage.drawShadows = true;
				else 
					lsrImage.drawShadows = dataAttribute == true;
				//animate
				dataAttribute = element.data( "animate" );
				if ( typeof dataAttribute === 'undefined' )
					lsrImage.animate = false;
				else 
					lsrImage.animate = dataAttribute == true;
				//focussed
				dataAttribute = element.data( "zoom" );
				if ( typeof dataAttribute === 'undefined' )
					lsrImage.zoomEnabled = true;
				else 
					lsrImage.zoomEnabled = dataAttribute == true;
				//responsive
				dataAttribute = element.data( "responsive" );
				if ( typeof dataAttribute === 'undefined' )
					lsrImage.responsive = false;
				else 
					lsrImage.responsive = dataAttribute == true;
					
				//display the image
				displayLSRImage(lsrImage, element);	
			});
		  }
		};
		xhr.onreadystatechange = function (e) {  
		    if (xhr.readyState === 4) {  
		    	if (xhr.status !== 200) {  
					console.log("LSR-img: The following LSR file could not be loaded: " + filename); 
		        }  
		    }  
		};
			
		xhr.send();
	}
	
	function unzipLSRFile(blob, successCallback) {
		zip.createReader(new zip.BlobReader(blob), function(zipReader) {
			zipReader.getEntries(function(entries) {
				
				var entriesHash = {};
				for ( var i = 0; i < entries.length; i++)
				{
					entriesHash[entries[i].filename] = entries[i];
				}
				//find out the lsr file content
				entriesHash["Contents.json"].getData(new zip.TextWriter(), function(data) {
					var lsrImage = jQuery.parseJSON( data );
					lsrImages.push(lsrImage);
					lsrImage.layersLoading = lsrImage.layers.length;
					for ( var i = 0; i < lsrImage.layers.length; i++ )
					{
						openLSRLayer( lsrImage.layers[i], entriesHash, function(success)
						{
							--lsrImage.layersLoading;
							
							if ( !success )
								console.log("LSR-img: One or more errors attempting to load lsr layer: " + lsrImage.layers[i].filename);
								
							if ( lsrImage.layersLoading == 0)
							{
								zipReader.close();
								successCallback(lsrImage);
							}	
						});
					}
				});
			});
		}, function(message){
			console.log("LSR-img: Failed to unzip the LSR file: " + message); 
		});
	}
	
	function openLSRLayer( lsrImageLayer, entriesHash, successCallback )
	{
		var entryName = lsrImageLayer.filename + "/Contents.json";
		
		entriesHash[entryName].getData(new zip.TextWriter(), function(data) {
			var json = jQuery.parseJSON( data );
			lsrImageLayer.info = json.info;
			lsrImageLayer.properties = json.properties;
			openLSRImageSet( lsrImageLayer, entriesHash, successCallback );
		});
	}
	function openLSRImageSet( lsrImageLayer, entriesHash, successCallback )
	{
		var entryName = lsrImageLayer.filename + "/Content.imageset/Contents.json";
		entriesHash[entryName].getData(new zip.TextWriter(), function(data) {
			var json = jQuery.parseJSON( data );
			lsrImageLayer.images = json.images;
			//currently only one image set available
			if ( lsrImageLayer.images.length > 0 )
			{
				openImage(lsrImageLayer.images[0], lsrImageLayer.filename + "/Content.imageset/" + lsrImageLayer.images[0].filename, entriesHash, successCallback );
			}
			else 
			{
				console.log("LSR-img: No Images specified in the layer: " + entryName); 
				successCallback(false);
			}
		});
	}
	function openImage( lsrLayerImage, entryName, entriesHash, successCallback )
	{
		var ext = entryName.substr(entryName.lastIndexOf('.')+1);
		if ( ext.match(/(jpg|jpeg|png|gif)$/) )
		{
			var mimeType = ["image/" + ext];
			entriesHash[entryName].getData(new zip.Data64URIWriter(mimeType), function(data) {
				lsrLayerImage.fileData = data;
				successCallback(true);
			});
		}
		else 
		{
			console.log("LSR-img: Layered Image had an unsupported File Type: " + entryName); 
			successCallback(false);
		}
	}
	
	/*------------------------------
		Image Display -
	------------------------------*/
	function displayLSRImage(lsrImage, element)
	{
		//for rendering we add padding to the canvas size for shadows and centering on focus
	    lsrImage.canvasSize = { width : lsrImage.properties.canvasSize.width + lsrShadowPadding * 2, 
	    	height : lsrImage.properties.canvasSize.height + lsrShadowPadding * 2};
	    
		lsrImage.canvas = $('<canvas/>',{ 'class':'lsr-canvas' } );
	    lsrImage.canvas.prop({ width: lsrImage.canvasSize.width,
	        height: lsrImage.canvasSize.height
	    });
	    
	    //create a canvas to render the shadow on
	    lsrImage.shadowCanvas = $('<canvas/>');
	    lsrImage.shadowCanvas.prop({ width: lsrImage.canvasSize.width,
	        height: lsrImage.canvasSize.height
	    });
		lsrImage.shadowCtx = lsrImage.shadowCanvas.get(0).getContext('2d');
	    
	    lsrImage.properties.canvasCentre = {};
	  	lsrImage.properties.canvasCentre.x = lsrImage.properties.canvasSize.width * 0.5;
	  	lsrImage.properties.canvasCentre.y = lsrImage.properties.canvasSize.height * 0.5;
		
		lsrImage.focussedSize = {};
		lsrImage.unfocussedSize = {};
		var unfocussedReduction = lsrFocussedPadding * 2;
		var aspectRatio = lsrImage.properties.canvasSize.width / lsrImage.properties.canvasSize.height;
		if ( lsrImage.properties.canvasSize.width > lsrImage.properties.canvasSize.height )
		{
			lsrImage.focussedSize.width = lsrImage.properties.canvasSize.width / 1.06;
			lsrImage.unfocussedSize.width = lsrImage.focussedSize.width - unfocussedReduction;
			
			lsrImage.focussedSize.height = lsrImage.focussedSize.width / aspectRatio;
			lsrImage.unfocussedSize.height = lsrImage.unfocussedSize.width / aspectRatio;
			lsrImage.focussedScale = 1 / lsrImage.properties.canvasSize.width * lsrImage.focussedSize.width;
			lsrImage.unfocussedScale = 1 / lsrImage.properties.canvasSize.width * lsrImage.unfocussedSize.width;
		}
		else {
			lsrImage.focussedSize.height = lsrImage.properties.canvasSize.height / 1.06;
			lsrImage.unfocussedSize.height = lsrImage.focussedSize.height - unfocussedReduction;
			
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
	                
		lsrImage.ctx = lsrImage.canvas.get(0).getContext('2d');
	    	
		var loadCount = 0;
		for ( var i = 0; i < lsrImage.layers.length; i++)
		{
			var img = new Image();
			lsrImage.layers[i].img = img;
	        img.onload = function(){
	        	++loadCount;
	            if( loadCount == lsrImage.layers.length ) { 
	            	
					//hide the placeholder image now that we have our canvas
					element.append(lsrImage.canvas);
	            	drawLSRImage(lsrImage,0,0);
					element.children('.lsr-placeholder').hide();
					if ( lsrImage.responsive ) resizeLSRCanvas( lsrImage );
					if ( lsrImage.animate ) animateLSRImage( (new Date()).getTime(), lsrImage );
	            }
	        };
	        //for now all LSR images only have 1 image per layer, so load index 0
			img.src = lsrImage.layers[i].images[0].fileData;
		}
		
		if ( !lsrImage.animate )
		{	
			lsrImage.canvas.hover(
			  function() {
			  	if ( !lsrImage.focussed )
			  	{
			  		lsrImage.focussed = true;
			  		if ( focussedLsrCanvas !== null)
			  		{
			  			focussedLsrCanvas.focussed = false;
			  			drawLSRImage(focussedLsrCanvas,0,0);
			  			resetLSRCanvasRotation(focussedLsrCanvas);
			  			focussedLsrCanvas.canvas.off( "mousemove" );
			  		}
			  		focussedLsrCanvas = lsrImage;
			  		focussedLsrCanvas.canvas.mousemove(mousemoveOverFocussedLSRImage);
			  		
			  		drawLSRImage(lsrImage,0,0);
			  	}
			  }, function() {
			  	if ( lsrImage.focussed )
			  	{
			  		focussedLsrCanvas = null;
			  		lsrImage.focussed = false;
			  		lsrImage.canvas.off( "mousemove" );
			  		
			  		drawLSRImage(lsrImage,0,0);
			  		resetLSRCanvasRotation(lsrImage);
			  	}
			  }
			);
			
			if ( window.DeviceOrientationEvent )
			{
				//make it auto focussed for now by disabling zoom. in the future we could extend to be based on scroll visability
				lsrImage.zoomEnabled = false;
			}
		}	
	}
	
	
	var requestLSRAnimFrame = (function(callback) {
		return window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || window.oRequestAnimationFrame || window.msRequestAnimationFrame ||
		function(callback) {
		  window.setTimeout(callback, 1000 / 60);
		};
	})();
	      
	function animateLSRImage(startTime, lsrImage){
		if ( !lsrImage.focussed )
	  		lsrImage.focussed = true;
	  	
		var time = (new Date()).getTime() - startTime;
	
		var speed = 500;
		var theta = time / 500;
	
		var relX = Math.cos(theta);
		var relY = Math.sin(theta);
	   
	    //TODO- there is duplication across a few of used thse poisitioning functions, so they should be a refactored
	   	var rotateAroundX = -relX;
	   	var rotateAroundY = relY;
	   	
	   	var panX = -relX;
	   	var panY = relY;
		
		
		drawLSRImage(lsrImage, panX,panY);
		rotateLSRCanvas(lsrImage, rotateAroundX, rotateAroundY);
		
		requestLSRAnimFrame(function() {
		  animateLSRImage(startTime, lsrImage);
		});
	}  
	
	function resetLSRCanvasRotation(lsrImage)
	{
		rotateLSRCanvas(lsrImage, 0, 0);
	}
		
	function lsrClamp(val, min, max) 
	{
	    if(val > max) return max;
	    if(val < min) return min;
	    return val;
	}
	function lsrOrientationChange(e)
	{
		if ( window.orientation == 0 )
		{
			lsrDeviceOrientation =  'portrait';
			lsrAngleRange = 20;
			lsrMinAngleY = -10;
		}
		else
		{
			//less rotation on landscape 
			lsrDeviceOrientation = window.orientation == -90 ? 'landscapeInverse' : 'landscape';
			lsrAngleRange = 10;
			lsrMinAngleY = -5;
		}
		
		lsrMinAngleX = window.orientation == 90 ? lsrMinAngleY - 45 : lsrMinAngleY + 45;
		lsrAngleYCorrector = window.orientation == -90 ? -1 : 1;
	}
	function lsrOrientationUpdate(e)
	{
		if ( lsrDeviceOrientation == null )
			lsrOrientationChange(null);
		
		var x = e[lsrAxisTable[lsrDeviceOrientation].x];
		var y = e[lsrAxisTable[lsrDeviceOrientation].y] * lsrAngleYCorrector;
		var z = e[lsrAxisTable[lsrDeviceOrientation].z];
		
		var relX = lsrClamp( ( x - lsrMinAngleX ) / lsrAngleRange, 0, 1);
		var relY = lsrClamp( ( y - lsrMinAngleY ) / lsrAngleRange, 0, 1);
	    
	   	var rotateAroundX = relX * 2 -1;
	   	var rotateAroundY = relY * 2 -1;
	   	var panX = relY * 2 - 1;
	   	var panY = relX * 2 - 1;
	    
		for ( var n = 0; n < lsrImages.length; n++ )
		{		    
			drawLSRImage(lsrImages[n], panX, panY);
			rotateLSRCanvas(lsrImages[n], -rotateAroundX * 1, rotateAroundY * 1);
		}
	}
	function mousemoveOverFocussedLSRImage(e)
	{
		var parentOffset = focussedLsrCanvas.canvas.offset(); 
		var relX = e.pageX - parentOffset.left;
		var relY = e.pageY - parentOffset.top;
		
		relX = 1 / focussedLsrCanvas.canvas.width() * relX;
		relY = 1 / focussedLsrCanvas.canvas.height() * relY;
	   
	   	var rotateAroundX = relY*2 -1;
	   	var rotateAroundY = relX*2 -1;
	   	
	   	var panX = 1-relX*2;
	   	var panY = 1-relY*2;
	   	
		drawLSRImage(focussedLsrCanvas, panX,panY);
		rotateLSRCanvas(focussedLsrCanvas, rotateAroundX, -rotateAroundY);
	}
	function rotateLSRCanvas(lsrImage, degreeX, degreeY)
	{
		var perspective = 0;
		
	    if ( degreeX != 0 || degreeY != 0 )
			perspective = 1000;
	    
	    degreeX *= 3;
	    degreeY *= 3;
	    
		lsrImage.canvas.parent().css({
	                '-webkit-perspective': perspective + 'px',
	                '-moz-perspective': perspective + 'px',
	                '-ms-perspective': perspective + 'px',
	                '-o-perspective': perspective + 'px',
	                'perspective': perspective + 'px'
	    });
	    
	    lsrImage.canvas.css({
	                '-webkit-transform': ' rotateY(' + degreeY + 'deg)' + ' rotateX(' + degreeX + 'deg)',
	                '-moz-transform': ' rotateY(' + degreeY + 'deg)' + ' rotateX(' + degreeX + 'deg)',
	                '-ms-transform': ' rotateY(' + degreeY + 'deg)' + ' rotateX(' + degreeX + 'deg)',
	                '-o-transform': ' rotateY(' + degreeY + 'deg)' + ' rotateX(' + degreeX + 'deg)',
	                'transform': ' rotateY(' + degreeY + 'deg)' + ' rotateX(' + degreeX + 'deg)'
	    });
	}
	
	//TODO. lots of opportunity for optimisation in this function 
	function drawLSRImage(lsrImage, relX, relY)
	{
		lsrImage.ctx.clearRect(0, 0, lsrImage.canvasSize.width, lsrImage.canvasSize.height);
		lsrImage.ctx.globalCompositeOperation = 'source-over';
	    
		var focusScale;
		var focusOffset = {};
		if ( lsrImage.focussed || !lsrImage.zoomEnabled )
		{
			focusScale = lsrImage.focussedScale;
			focusOffset.x = lsrImage.focussedOffset.x;
			focusOffset.y = lsrImage.focussedOffset.y;
		}
		else
		{
			focusScale = lsrImage.unfocussedScale;
			focusOffset.x = lsrImage.unfocussedOffset.x;
			focusOffset.y = lsrImage.unfocussedOffset.y;
		}
	    
	           
	    var baseLayer = true;
	    var max = lsrImage.layers.length-1;
	    var scalePerLayer = 0.06 / max;
	    
	    //turning off image smoothing sharpens the image but creates lines in animation and poor resuls when scaling, to invesitgate
		// lsrImage.ctx.mozImageSmoothingEnabled = false;
		// lsrImage.ctx.webkitImageSmoothingEnabled = false;
		// lsrImage.ctx.msImageSmoothingEnabled = false;
		// lsrImage.ctx.imageSmoothingEnabled = false;
			 
		var baseRect = {};
	    for ( var i = max; i >= 0; --i )
	    {
	    	var x = focusOffset.x, y = focusOffset.y; 
	    	var sizeScale = focusScale;
	    	
	    	//TODO. the default value should probably be calculated as a proportion of the width/height or padding
	    	var panOffset = { x: relX*15, y: relY*10};
	    	
	    	//increase the scale for each layer
	    	if ( lsrImage.focussed || !lsrImage.zoomEnabled )
	    		sizeScale += (max - i) * scalePerLayer;
	    	
	    	var width = lsrImage.layers[i].properties["frame-size"].width * sizeScale;
	    	var height = lsrImage.layers[i].properties["frame-size"].height * sizeScale;
			   	
	    	if (typeof lsrImage.layers[i].properties["frame-center"] !== 'undefined')
	    	{
	    		x += lsrImage.layers[i].properties["frame-center"].x * focusScale;
	    		y += lsrImage.layers[i].properties["frame-center"].y * focusScale;
	    	}
	    	else
	    	{
	    		x += lsrImage.properties.canvasCentre.x * focusScale;
	    		y += lsrImage.properties.canvasCentre.y * focusScale;
	    	}	
	    	 
			//as we move up the layers the further from the center, the more pronounced the move
			if ( lsrImage.focussed || !lsrImage.zoomEnabled )
			{
				var distfromCenter = {x: lsrImage.properties.canvasCentre.x - lsrImage.layers[i].properties["frame-center"].x, 
				y: lsrImage.properties.canvasCentre.y - lsrImage.layers[i].properties["frame-center"].y};
				
				//TODO. these numbers seem to work, would be good to have a better rationale behind them though
				x -= distfromCenter.x * 0.03 * (max-i);
				y -= distfromCenter.y * 0.03 * (max-i);

				panOffset.x += (lsrImage.canvasSize.width * 0.003) * i * relX;
	    		panOffset.y += (lsrImage.canvasSize.width * 0.003) * i * relY;
			}
	    	
	    	//adjust with the pan	
	    	x -= width * 0.5 + panOffset.x;
	    	y -= height * 0.5 + panOffset.y;
	    	
			lsrImage.ctx.drawImage( lsrImage.layers[i].img, x, y, width, height);
			
	    	if ( baseLayer )
	    	{
	    		baseLayer = false;
	    		baseRect.x = x;
	    		baseRect.y = y;
	    		baseRect.width = width;
	    		baseRect.height = height;
	    	}
	    }
	    
	    //add the highlight
	    if ( lsrHighlightImage !== null && (lsrImage.focussed || !lsrImage.zoomEnabled) )
	    {
	    	x = lsrImage.focussedSize.width * ((1-relX)*0.5) - lsrImage.focussedSize.width * 0.5;
	    	y = lsrImage.focussedSize.height * ((1-relY)*0.5) - lsrImage.focussedSize.width * 0.6;
	    	lsrImage.ctx.drawImage( lsrHighlightImage, x, y, lsrImage.focussedSize.width, lsrImage.focussedSize.width);
	    }
	    
	    //finally we draw our frame and crop
	    if ( lsrImage.roundedCorners )
	    {
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
		}
		else {
		    lsrImage.ctx.fillStyle = '#fff'; 
			lsrImage.ctx.globalCompositeOperation = 'destination-in';
			lsrImage.ctx.beginPath();
	    	lsrImage.ctx.rect(baseRect.x, baseRect.y, baseRect.width, baseRect.height);
			lsrImage.ctx.closePath();
			lsrImage.ctx.fill();
		}
		
		//add some shadows
		if ( lsrImage.drawShadows )
		{
			lsrImage.shadowCtx.clearRect(0, 0, lsrImage.canvasSize.width, lsrImage.canvasSize.height);
		
			var indent = 10;
			var shadowSize = (lsrImage.focussed || !lsrImage.zoomEnabled) ? lsrShadowPadding * 0.5 : lsrShadowPadding * 0.25;
			lsrImage.shadowCtx.beginPath();
			lsrImage.shadowCtx.fillStyle = '#000';
		    lsrImage.shadowCtx.rect(baseRect.x + indent*0.5, baseRect.y + indent*0.5, baseRect.width-indent, baseRect.height-indent);
			lsrImage.shadowCtx.shadowBlur = shadowSize;
		    lsrImage.shadowCtx.shadowColor = lsrImage.focussed  ? '#666' : '#999';
			lsrImage.shadowCtx.shadowOffsetX = 0;
			lsrImage.shadowCtx.shadowOffsetY = (shadowSize * 0.5);
			lsrImage.shadowCtx.closePath();
			lsrImage.shadowCtx.fill();
		      
			lsrImage.ctx.globalCompositeOperation = 'destination-over';
		    lsrImage.ctx.drawImage(lsrImage.shadowCanvas.get(0), 0, 0);
		 }
	} 

	return {
	    setScriptFolder: function(path) {
	      scriptsFolder = path;
		},
		
		setHighlightImage: function(imgPath) {
			lsrHighlightImagePath = imgPath;
		}
	};

})();
