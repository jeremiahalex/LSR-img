# lsr-img.js

(work in progress) Web previewer for Apple's Layer Source Representation (LSR) Image format.

Made by Jeremiah Alexander [@JeremiahAlex][1]

## Usage
```html
<div id="lsrid"
     class="lsr-img"
     data-image-src="../img/gmtest1.lsr"
     style="text-align: center;">
    <img src="../img/lsr-placeholder.jpg" class="lsr-placeholder" style="padding: 50px;"/>
</div>
<script src="../../../node_modules/jszip/dist/jszip.min.js"></script>
<script src="../../../dist/lsr-img.js"></script>
<script>
    lsrimg.LSRImg();
</script>
```

## Setting
You can currently customise your LSR image display, using the following data-attributes on your div.
- **data-rounded**\
true/false to use rounded corners like Apple TV does. Default is false.
- **data-shadows**\
true/false whether drop shadows should be added. Default is true.
- **data-zoom**\
true/false whether an image should zoom in & out as it gains focus. Default is true.
- **data-animate**\
true/false whether the image should just display on an animated loop. Default is false.
- **data-responsive**\
true/false whether the image should scale to the size of the containing div. Default is false.


  [1]: http://twitter.com/jeremiahalex