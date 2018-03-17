'use strict';

const fs = require('fs');
const VG = require('napi_openvg');

function toULong(x) {
    return x >>> 0;  // The >>> operator does ToUint32
}

function toLong(x) {
    return x & 0xFFFFFFFF; // This should do ToInt32
}

function toUShort(x) {
    return (x >>> 0) & 0xFFFF;  // Convert to uint32, and then truncate.
}

function mult32s(n, m) //signed version
{
    'use asm';
    n |= 0;
    m |= 0;
    let nlo = n & 0xffff;
    let nhi = n - nlo;
    return ( (nhi * m | 0) + (nlo * m) ) | 0;
}

function mult32u(n, m) //unsigned version
{
    'use asm';
    n >>>= 0;
    m >>>= 0;
    let nlo = n & 0xffff;
    let nhi = n - nlo;
    return ( (nhi * m >>> 0) + (nlo * m) ) >>> 0;
}

function Font() {
  this.num_of_tables = 0;
  this.head_offset = 0;
  this.maxp_offset = 0;
  this.cmap_offset = 0;
  this.glyf_offset = 0;
  this.loca_offset = 0;
  this.hhea_offset = 0;
  this.hmtx_offset = 0;
  this.unitsPerEm = 0;
  this.indexToLocFormat = 0;
  this.glyphDataFormat = 0;
  this.xMin = 0;
  this.yMin = 0;
  this.xMax = 0;
  this.yMax = 0;
  this.numGlyphs = 0;
  this.numberEncodingTables = 0;
  this.index_map = 0;
  this.data = null;

  this.segments = [];
  this.coords = [];
  this.coords_count = 0;
  this.segments_count = 0;
  this.cache = [];

  this.face = null;
  this.glyphCount = -1;
  this.ascender = null;
  this.descender = null;
  // extra
  this.height = 0;
}

Font.prototype.readUint16 = function(offset) {
  'use asm';
  let value = (this.data[offset] << 8) | this.data[offset + 1];
  return value;
}

Font.prototype.readUint32 = function(offset) {
  'use asm';
  let value = (this.data[offset] << 24) | (this.data[offset + 1] << 16) | (this.data[offset + 2] << 8) | (this.data[offset + 3]);
  return value;
}

Font.prototype.loadFile = function(path) {
    let stat = fs.statSync(path);
    let handle = fs.openSync(path, 'r');
    let buf = new Buffer(stat.size);
    let read = fs.readSync(handle, buf, 0, stat.size, null); 
    fs.closeSync(handle);
    this.load(buf);
}

Font.prototype.load = function(buf) {
  // create data view
  this.data = new Uint8Array(buf);
  this.num_of_tables = this.readUint16(4);
  let ofs = 12 | 0;
  for(let i = 0; i < this.num_of_tables; i++) {
      let tag = String.fromCharCode.apply(null, this.data.slice(ofs, ofs+4));
      ofs += 4;
      
      ofs += 4;
      let value = this.readUint32(ofs);
      ofs += 4;
      ofs += 4;
      
      if(tag == "head") {
          this.head_offset = value;
      } else if(tag == "maxp") {
          this.maxp_offset = value;
      } else if(tag == "cmap") {
          this.cmap_offset = value;
      } else if(tag == "glyf") {
          this.glyf_offset = value;
      } else if(tag ==  "loca") {
          this.loca_offset = value;
      } else if(tag == "hhea") {
          this.hhea_offset = value;
      } else if(tag == "hmtx") {
          this.hmtx_offset = value;
      }
  }
  
  ofs = this.head_offset;
  
  this.unitsPerEm = this.readUint16(ofs + 18);
  this.xMin = this.readUint16(ofs + 36);
  this.yMin = this.readUint16(ofs + 38);
  this.xMax = this.readUint16(ofs + 40);
  this.yMax = this.readUint16(ofs + 42);

  this.indexToLocFormat = this.readUint16(ofs + 50);
  this.glyphDataFormat = this.readUint16(ofs + 52);

  ofs = this.maxp_offset;
  this.numGlyphs = this.readUint16(ofs + 4);

  ofs = this.cmap_offset;
  this.numberEncodingTables = this.readUint16(ofs + 2);

  
  this.index_map = 0;
  for(let i = 0; i < this.numberEncodingTables; i++) {
      let platformID = this.readUint16(ofs + 8 * i + 4);
      let platformSpecificID = this.readUint16(ofs + 8 * i + 6);
      let value = this.readUint32(ofs + 8 * i + 8);
      
      if(platformID == 3 &&
         ( platformSpecificID == 1|| platformSpecificID == 10)) {
          this.index_map = this.cmap_offset + value;
      }
      else if (platformID == 0) {
          this.index_map = this.cmap_offset + value;
      }
  }

  let ascent  = this.readUint16(this.hhea_offset + 4);
  let descent  = this.readUint16(this.hhea_offset + 6);
  if(ascent > 32767) {
    ascent = ascent - 65536;
  } 
  if(descent > 32767) {
    descent = descent - 65536;
  } 
  this.ascender  = ascent;
  this.descender = descent;

  return this;
}

Font.prototype.glyphBBoxes = function (glyph_index) {
  this.segments_count = 0;
  this.coords_count = 0;
  this.segments = [];
  this.coords = [];
  
  this.loadGlyph(glyph_index);
  var minX = 10000000.0, minY = 100000000.0, maxX = -10000000.0, maxY = -10000000.0;

  for (let i = 0; i < this.coords_count / 2; ++i) {
    if (this.coords[i * 2    ] < minX) minX = this.coords[i * 2    ];
    if (this.coords[i * 2    ] > maxX) maxX = this.coords[i * 2    ];
    if (this.coords[i * 2 + 1] < minY) minY = this.coords[i * 2 + 1];
    if (this.coords[i * 2 + 1] > maxY) maxY = this.coords[i * 2 + 1];
  }
  if (!this.coords_count) {
    minX = 0.0;
    minY = 0.0;
    maxX = 0.0;
    maxY = 0.0;
  }
  return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
};

Font.prototype.glyphAdvances = function (glyph_index) {
  let numOfLongHorMetrics = this.readUint16(this.hhea_offset + 34);
  let advanceWidth;
  let leftSideBearing; 
  if (glyph_index < numOfLongHorMetrics) {
      advanceWidth    = this.readUint16(this.hmtx_offset + 4*glyph_index);
      leftSideBearing = this.readUint16(this.hmtx_offset + 4*glyph_index + 2);
  } else {
      advanceWidth    = this.readUint16(this.hmtx_offset + 4*(numOfLongHorMetrics-1));
      leftSideBearing = this.readUint16(this.hmtx_offset + 4*numOfLongHorMetrics + 2*(glyph_index - numOfLongHorMetrics));
  }
  return advanceWidth;
};


Font.prototype.glyphIndex = function(uni_char)
{
    uni_char = uni_char | 0;
    
    let index_map = this.index_map;
    let format = this.readUint16(index_map + 0);
    let ret;
    
    if (format == 0) {
        let bytes = this.readUint16(index_map + 2);
        if (uni_char < bytes-6) {
            ret = this.data[index_map + 6 + uni_char];
            return ret;
        }
        return 0;
    } else if (format == 6) {
        let first = this.readUint16(index_map + 6);
        let count = this.readUint16(index_map + 8);
        if (uni_char >= first &&  uni_char < first+count) {
            ret = this.readUint16(index_map + 10 + (uni_char - first)*2);
            return ret;
        }
        return 0;
    } else if (format == 2) {
        return 0;
    } else if (format == 4) {
        let segcount = this.readUint16(index_map + 6) >> 1;
        let searchRange = this.readUint16(index_map + 8) >> 1;
        let entrySelector = this.readUint16(index_map + 10);
        let rangeShift = this.readUint16(index_map + 12) >> 1;
        let item, offset, start, end;
        
        let endCount = index_map + 14;
        let search = endCount;
        
        if (uni_char > 0xffff) {
            return 0;
        }
        
        if (uni_char >= this.readUint16(search + rangeShift*2)) {
            search += rangeShift*2;
        }
        
        search -= 2;
        while (entrySelector) {
            let start, end;
            searchRange >>= 1;
            
            start = this.readUint16(search + searchRange*2 + segcount*2 + 2);
            end = this.readUint16(search + searchRange*2);
            if (uni_char > end) {
                search += searchRange*2;
            }
            
            --entrySelector;
        }
        search += 2;
        
        item = ((search - endCount) >> 1);
        
        start = this.readUint16(index_map + 14 + segcount*2 + 2 + 2*item);
        end = this.readUint16(index_map + 14 + 2 + 2*item);
        if (uni_char < start) {
            return 0;
        }
        
        offset = this.readUint16(index_map + 14 + segcount*6 + 2 + 2*item);
        if (offset == 0)
        {
            ret =  uni_char + this.readUint16(index_map + 14 + segcount*4 + 2 + 2*item);
            ret = ret % 65536;
            return ret;
        }
        
        ret = this.readUint16(offset + (uni_char-start)*2 + index_map + 14 + segcount*6 + 2 + 2*item);
        return ret;
        
    } else if (format == 12) {
        let ngroups = this.readUint16(index_map+6);
        let low = 0;
        let high = ngroups;
        
        while (low <= high) {
            let mid = low + ((high-low) >> 1); // rounds down, so low <= mid < high
            let start_char = this.readUint32(index_map +16 + mid*12);
            let end_char = this.readUint32(index_map + 16 + mid*12 + 4);
            if (uni_char < start_char) {
                high = mid - 1;
            }
            else if (uni_char > end_char) {
                low = mid + 1;
            }
            else {
                let start_glyph = this.readUint32(index_map + 16 + mid*12 + 8);
                ret = start_glyph + uni_char - start_char;
                return ret;
            }
        }
        return 0; // not found
    }    
    return 0;
}

Font.prototype.glyphs = function(ch, glyph_index) {

  if(glyph_index == undefined) {
    glyph_index = this.find_glyph_index(ch);
  }

  let vg_path;

  if(ch <= 256 && this.cache[glyph_index] != undefined) {
    vg_path = this.cache[glyph_index];
  } else {
    this.segments_count = 0;
    this.coords_count = 0;
    this.segments = [];
    this.coords = [];
    
    this.loadGlyph(glyph_index);
    
    vg_path = VG.vgCreatePath(VG.VG_PATH_FORMAT_STANDARD, VG.VG_PATH_DATATYPE_F, 1.0, 0.0, 0, 0, VG.VG_PATH_CAPABILITY_ALL);
    VG.vgAppendPathData(vg_path, this.segments_count, this.segments, this.coords);  

    if(ch <= 256) {
      this.cache[glyph_index] = vg_path;      
    }
  }
  return vg_path; 
}

// internal
Font.prototype.loadGlyph = function(glyph_index)
{
  let num_vertices = 0;
  let vertices = [];
  
  let g1,g2;
  let s_ofs;
  if (glyph_index >= this.numGlyphs) {
      return -1; // glyph index out of range
  }
  if (this.indexToLocFormat >= 2) {
      return -1; // unknown index->glyph map format
  }
  
  if (this.indexToLocFormat == 0) {
      g1 = this.glyf_offset + this.readUint16(this.loca_offset + glyph_index * 2) * 2;
      g2 = this.glyf_offset + this.readUint16(this.loca_offset + glyph_index * 2 + 2) * 2;
  } else {
      g1 = this.glyf_offset + this.readUint32(this.loca_offset + glyph_index * 4);
      g2 = this.glyf_offset + this.readUint32(this.loca_offset + glyph_index * 4 + 4);
  }
  
  if(g1 == g2) {
    s_ofs = -1;
  } else {
    s_ofs = g1;
  }
  
  if (s_ofs < 0) {
    return 0;
  } 

  let num_of_contours = this.readUint16(s_ofs);
  if(num_of_contours > 32767) {
    num_of_contours = num_of_contours - 65536;
  }
  
  if (num_of_contours > 0) {
    let n, m;
    let x,y;
    let end_ofs;
    let cur_pos;
    
    end_ofs = s_ofs + 10;
    cur_pos = end_ofs + num_of_contours * 2 + 2 + this.readUint16(end_ofs + num_of_contours * 2);
     
    n = this.readUint16(end_ofs + num_of_contours*2 - 2) + 1;
    m = n + 2 * num_of_contours; 

    let flagcount = 0;
    let flags = 0;

    //vertices = new Array(m);
    vertices = [];

    for(let i = 0; i < m; i++) {
      vertices[i] = { x: 0, y : 0, type : 0};
    }
    
    for (let i = 0; i < n; ++i) {
      if (flagcount == 0) {
          flags = this.data[cur_pos];
          cur_pos++;
          if ((flags & 8)) {
            flagcount = this.data[cur_pos];
            cur_pos++;
          }
        } else {
          flagcount--;
      }
      vertices[i].type = flags;
    }
    
    x = 0;
    for (let i = 0; i < n; ++i) {
        flags = vertices[i].type;
        if ((flags & 2)) {
            let dx = this.data[cur_pos];
            cur_pos++;
            x += ((flags & 16)) ? dx : -dx; 
        } else {
            if ((flags & 16) == 0) {
                let dx = this.readUint16(cur_pos);
                if(dx > 32767) {
                  dx = dx - 65536;
                } 
                x = x + dx;
                cur_pos += 2;
            }  
        }
        if(x > 32767) {
          x = x - 65536;
        } 
        vertices[i].x = x;
    }

    y = 0;
    for (let i = 0; i < n; ++i) {
        flags = vertices[i].type;
        if ((flags & 4)) {
            let dy = this.data[cur_pos];
            cur_pos++;
            y += ((flags & 32)) ? dy : -dy; 
        } else {
            if ((flags & 32) == 0) {
                let dy = this.readUint16(cur_pos);
                if(dy > 32767) {
                  dy = dy - 65536;
                }
                y = y + dy;
                cur_pos += 2;                    
            } 
        }

        if(y > 32767) {
          y = y - 65536;
        }
        vertices[i].y = y;
        vertices[i].type = flags & 1;
    }

    let next_move  = 0;
    let prev_flag = 1;
    let sx = 0;
    let sy = 0;
    let cx = 0;
    let cy = 0;
    
    let j = 0;
    for(let i = 0; i < n; i++) {
      flags = vertices[i].type;
      x = vertices[i].x;
      y = vertices[i].y;
      
      if(next_move == i) {
        if(i != 0) {
          if(prev_flag) { // On
            if(this.coords[this.coords_count-2] != sx ||
              this.coords[this.coords_count-1] != sy) {
              this.segments[this.segments_count++] = VG.VG_LINE_TO;
              this.coords[this.coords_count++] = sx;
              this.coords[this.coords_count++] = sy;
            }
          } else { // Off
            this.coords[this.coords_count++] = sx;
            this.coords[this.coords_count++] = sy;
          }
          this.segments[this.segments_count++] = VG.VG_CLOSE_PATH;
        }
        
        if(flags) { // On
          sx = x;
          sy = y;
        }
        else { // Off
          sx = x;
          sy = y;
          
          if(vertices[i+1].type) {
            x = vertices[i+1].x;
            y = vertices[i+1].y;
            i++; 
          } else { // Off
            x = (x + vertices[i+1].x) >> 1;
            y = (y + vertices[i+1].y) >> 1;
          }
        }
        // set ON
        prev_flag = 1;
        
        this.segments[this.segments_count++] = VG.VG_MOVE_TO;
        this.coords[this.coords_count++] = x;
        this.coords[this.coords_count++] = y;
        
        next_move = 1 + this.readUint16(end_ofs + j*2);
        j++;
            
      } else {
        if(flags) { // On
          if(prev_flag) { // On
            // ON-ON line
            this.segments[this.segments_count++] = VG.VG_LINE_TO;
            this.coords[this.coords_count++] = x;
            this.coords[this.coords_count++] = y;
          } else {
            // OFF-ON curve : close curve
            this.coords[this.coords_count++] = x;
            this.coords[this.coords_count++] = y;
          }
          prev_flag = 1;
      } else { // Off
          if(prev_flag) { // On
            // ON-OFF
            this.segments[this.segments_count++] = VG.VG_QUAD_TO;
            this.coords[this.coords_count++] = x;
            this.coords[this.coords_count++] = y;
            cx = x;
            cy = y;
          } else { // Off-Off
            this.coords[this.coords_count++] = (cx + x) >> 1;
            this.coords[this.coords_count++] = (cy + y) >> 1;

            this.segments[this.segments_count++] = VG.VG_QUAD_TO;
            this.coords[this.coords_count++] = x;
            this.coords[this.coords_count++] = y;

            cx = x;
            cy = y;
          }
          prev_flag = 0;
        }                
      }
    }
    
    // last
    if(prev_flag == 0) { // Off
      // close curve
      this.coords[this.coords_count++] = sx;
      this.coords[this.coords_count++] = sy;
    } else {
      // OnCurve
      if(this.coords[this.coords_count-2] != sx ||
        this.coords[this.coords_count-1] != sy) {
        this.segments[this.segments_count++] = VG.VG_LINE_TO;
        this.coords[this.coords_count++] = sx;
        this.coords[this.coords_count++] = sy;
      }
    }
    this.segments[this.segments_count++] = VG.VG_CLOSE_PATH;
  }
  else if (num_of_contours == -1)
  {
    // Compound shapes.
    let more = 1;
    let comp_ofs = s_ofs + 10;
    num_vertices = 0;

    while (more) {
      let flags, gidx;
      let mtx = [1,0,0,1,0,0];
      
      flags = this.readUint16(comp_ofs);
      comp_ofs += 2;
      gidx = this.readUint16(comp_ofs);
      comp_ofs += 2;
      
      if (flags & 2) { // XY values
        if (flags & 1) { // shorts
          mtx[4] = this.readUint16(comp_ofs);
          comp_ofs+=2;
          mtx[5] = this.readUint16(comp_ofs);
          comp_ofs+=2;
        } else {
          mtx[4] = this.data[comp_ofs]; comp_ofs+=1;
          mtx[5] = this.data[comp_ofs]; comp_ofs+=1;
        }
      }

      if (flags & (1<<3)) { 
        mtx[0] = mtx[3] = this.readUint16(comp_ofs)/16384.0; 
        comp_ofs+=2;
        mtx[1] = mtx[2] = 0;
      } else if (flags & (1<<6)) {
        mtx[0] = this.readUint16(comp_ofs)/16384.0; 
        comp_ofs+=2;
        mtx[1] = mtx[2] = 0;
        mtx[3] = this.readUint16(comp_ofs)/16384.0; 
        comp_ofs+=2;
      } else if (flags & (1<<7)) {
        mtx[0] = this.readUint16(comp_ofs)/16384.0; 
        comp_ofs+=2;
        mtx[1] = this.readUint16(comp_ofs)/16384.0; 
        comp_ofs+=2;
        mtx[2] = this.readUint16(comp_ofs)/16384.0; 
        comp_ofs+=2;
        mtx[3] = this.readUint16(comp_ofs)/16384.0; 
        comp_ofs+=2;
      }
      this.loadGlyph(gidx);
      more = flags & (1<<5);
    }
  } 
  return 0;
}

module.exports = Font;
