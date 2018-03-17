# openvg_ttf

Pure JS module to parse truetype for Open VG rendering. Some parts of parsing code are borrowed from [Sean Barrett](https://github.com/nothings/stb/blob/master/stb_truetype.h) under the license of MIT.  
You need [napi_openvg](https://github.com/yubin1026/napi_openvg), [napi_sdl2](https://github.com/yubin1026/napi_sdl2) to use this.

## Supported OS
Currently tested only in macOS but will support others soon.


## Installation

```javascript
npm install napi_sdl2
npm install napi_openvg
npm install openvg_ttf
```

## Usage

Load ttf font file.
```javascript
let font = new Font();
font.loadFile('/Library/Fonts/AppleGothic.ttf');
```

Make text string to Open VG path.
```javascript
function renderToPath(text, font, size) {
  let textPath = VG.vgCreatePath(VG.VG_PATH_FORMAT_STANDARD, VG.VG_PATH_DATATYPE_F, 1.0, 0.0, 0, 0, VG.VG_PATH_CAPABILITY_ALL);

  let dpi = 220.0;
  let ppem = size * dpi / 72.0 ;
  //ppem = size;
  let scale = ppem / font.unitsPerEm;
  let adv = 0;

  VG.vgSeti(VG.VG_MATRIX_MODE, VG.VG_MATRIX_PATH_USER_TO_SURFACE);
  VG.vgLoadIdentity();
  for (let i = 0; i < text.length; i++) {
    let ch = text.charCodeAt(i);
    let glyph = font.glyphIndex(ch);
    if (glyph < 0 || glyph === undefined) {
      continue; 
    }
    let glyphs = font.glyphs(ch, glyph);

    VG.vgTranslate(adv, (font.ascender * scale));
    VG.vgScale(scale, -scale);
    
    VG.vgTransformPath(textPath, glyphs);
   
    VG.vgSeti(VG.VG_MATRIX_MODE, VG.VG_MATRIX_PATH_USER_TO_SURFACE);
    VG.vgLoadIdentity();

    let cur = (font.glyphAdvances(glyph) * scale) | 0;
    adv += cur;  
  }
  return textPath;
}
```

Acutal draw string function.
```javascript
function draw_string(fillColor, strokeColor, text, font, size, x, y) {
    let textPath = renderToPath(text, font, size);

    let fillPaint;
    if(fillColor != null) {
      fillPaint = VG.vgCreatePaint();
      VG.vgSetParameteri(fillPaint, VG.VG_PAINT_TYPE, VG.VG_PAINT_TYPE_COLOR);
      VG.vgSetParameterfv(fillPaint, VG.VG_PAINT_COLOR, 4, fillColor);
      VG.vgSetPaint(fillPaint, VG.VG_FILL_PATH);      
    }
    
    let strokePaint = VG.vgCreatePaint();
    VG.vgSetParameteri(strokePaint, VG.VG_PAINT_TYPE, VG.VG_PAINT_TYPE_COLOR);
    VG.vgSetParameterfv(strokePaint, VG.VG_PAINT_COLOR, 4, strokeColor);
    VG.vgSetPaint(strokePaint, VG.VG_STROKE_PATH);

    VG.vgSeti(VG.VG_MATRIX_MODE, VG.VG_MATRIX_PATH_USER_TO_SURFACE);
    VG.vgLoadIdentity();

    let currentMatrix = VG.vgGetMatrix();
    VG.vgLoadMatrix(currentMatrix);
    let mat = [
        1.0,   0.0, 0.0,
        0.0,  1.0, 0.0,
        x,     y, 1.0
        ];
    
    VG.vgMultMatrix(mat);
    VG.vgSeti(VG.VG_RENDERING_QUALITY, VG.VG_RENDERING_QUALITY_BETTER);
    VG.vgSetf(VG.VG_STROKE_LINE_WIDTH, 0.6);

    let flag = VG.VG_STROKE_PATH;
    if(fillColor != null) {
      flag |= VG.VG_FILL_PATH;
    }

    VG.vgDrawPath(textPath, flag);

    if(fillColor != null) {
      VG.vgDestroyPaint(fillPaint);
    }
    VG.vgDestroyPaint(strokePaint);

    VG.vgLoadMatrix(currentMatrix);
    VG.vgDestroyPath(textPath);
}
```
