'use strict';

const util = require("util");
const fs = require('fs');

const SDL2 = require('napi_sdl2');
const VG = require('napi_openvg');
const Font = require('openvg_ttf');

let context = {
	font : null,
	window : null
}


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

function clear_box(x, y, w, h) {
    let clearColor = [1,1,1,1];
    VG.vgSetfv(VG.VG_CLEAR_COLOR, 4, clearColor);
    VG.vgClear(x, y, w, h);
}


function render(context)
{
	let [screen_width, screen_height] = SDL2.SDL_GetWindowSize(context.window);
	clear_box(0, 0, screen_width, screen_height);

	let text = "착記されグリフ";
	draw_string([0,0,0,1], [0,0,0,1], text, context.font, 20, 10, 10);

	VG.vgFlush();
	SDL2.SDL_GL_SwapWindow( context.window );
}

function main()
{
	SDL2.SDL_Init(SDL2.SDL_INIT_EVERYTHING);
	SDL2.SDL_GL_SetAttribute (SDL2.SDL_GL_CONTEXT_FLAGS, SDL2.SDL_GL_CONTEXT_FORWARD_COMPATIBLE_FLAG);
	SDL2.SDL_GL_SetAttribute(SDL2.SDL_GL_DOUBLEBUFFER, 1);
	SDL2.SDL_GL_SetAttribute(SDL2.SDL_GL_MULTISAMPLEBUFFERS, 8);
	SDL2.SDL_GL_SetAttribute(SDL2.SDL_GL_MULTISAMPLESAMPLES, 8);
	SDL2.SDL_GL_SetAttribute(SDL2.SDL_GL_DEPTH_SIZE, 24);
	SDL2.SDL_GL_SetAttribute(SDL2.SDL_GL_STENCIL_SIZE, 8);
	SDL2.SDL_GL_SetAttribute( SDL2.SDL_GL_CONTEXT_MAJOR_VERSION, 2 );
	SDL2.SDL_GL_SetAttribute( SDL2.SDL_GL_CONTEXT_MINOR_VERSION, 1 );

	let [screen_width, screen_height] = [800, 800];

	let sdl_window = SDL2.SDL_CreateWindow("OpenVG Text", 
		0, 0, screen_width, screen_height, SDL2.SDL_WINDOW_OPENGL | SDL2.SDL_WINDOW_SHOWN | SDL2.SDL_WINDOW_RESIZABLE);
	let sdl_context = SDL2.SDL_GL_CreateContext( sdl_window );
	SDL2.SDL_GL_SetSwapInterval(1);
	 
	let quit = false;
	VG.vgCreateContextSH(screen_width, screen_height);
	
	let font = new Font();
	font.loadFile('/Library/Fonts/AppleGothic.ttf');

	context.font = font;
	context.window = sdl_window;

	render(context);
	let cursor = SDL2.SDL_CreateSystemCursor(SDL2.SDL_SYSTEM_CURSOR_ARROW);
	SDL2.SDL_SetCursor(cursor);
	SDL2.SDL_ShowCursor(1);
			
 	SDL2.SDL_StartTextInput();
	while(!quit)
	{
		let event = {};
		SDL2.SDL_PumpEvents();
		while(1) {
			let ret = SDL2.SDL_PeepEvents(event, 1, SDL2.SDL_GETEVENT, SDL2.SDL_FIRSTEVENT, SDL2.SDL_LASTEVENT);
			if(ret == 1) break;
			SDL2.SDL_Delay(10);
			SDL2.SDL_PumpEvents();
		}

		switch(event.type)
		{
			case "MOUSEBUTTONDOWN":
				break;
			case "MOUSEBUTTONUP":
				break;
			case "MOUSEWHEEL":
				break;
			case "WINDOWEVENT":
				if(event.event == "WINDOWEVENT_RESIZED") {
					[screen_width, screen_height] = SDL2.SDL_GetWindowSize(context.window);

					VG.vgResizeSurfaceSH(screen_width, screen_height);

					render(context);
				} else if(event.event == "WINDOWEVENT_SIZE_CHANGED") {
		
				} else if(event.event == "WINDOWEVENT_EXPOSED") {
				}
				break;
			case "KEYDOWN":
				break;
			case "QUIT":
				quit = true;
				break;
		}
	}
	
	VG.vgDestroyContextSH();
	SDL2.SDL_DestroyWindow(context.window);
	SDL2.SDL_Quit();
}

main();
