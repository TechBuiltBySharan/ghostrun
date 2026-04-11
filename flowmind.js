#!/usr/bin/env node
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/pngjs/lib/chunkstream.js
var require_chunkstream = __commonJS({
  "node_modules/pngjs/lib/chunkstream.js"(exports2, module2) {
    "use strict";
    var util = require("util");
    var Stream = require("stream");
    var ChunkStream = module2.exports = function() {
      Stream.call(this);
      this._buffers = [];
      this._buffered = 0;
      this._reads = [];
      this._paused = false;
      this._encoding = "utf8";
      this.writable = true;
    };
    util.inherits(ChunkStream, Stream);
    ChunkStream.prototype.read = function(length, callback) {
      this._reads.push({
        length: Math.abs(length),
        // if length < 0 then at most this length
        allowLess: length < 0,
        func: callback
      });
      process.nextTick(
        function() {
          this._process();
          if (this._paused && this._reads && this._reads.length > 0) {
            this._paused = false;
            this.emit("drain");
          }
        }.bind(this)
      );
    };
    ChunkStream.prototype.write = function(data, encoding) {
      if (!this.writable) {
        this.emit("error", new Error("Stream not writable"));
        return false;
      }
      let dataBuffer;
      if (Buffer.isBuffer(data)) {
        dataBuffer = data;
      } else {
        dataBuffer = Buffer.from(data, encoding || this._encoding);
      }
      this._buffers.push(dataBuffer);
      this._buffered += dataBuffer.length;
      this._process();
      if (this._reads && this._reads.length === 0) {
        this._paused = true;
      }
      return this.writable && !this._paused;
    };
    ChunkStream.prototype.end = function(data, encoding) {
      if (data) {
        this.write(data, encoding);
      }
      this.writable = false;
      if (!this._buffers) {
        return;
      }
      if (this._buffers.length === 0) {
        this._end();
      } else {
        this._buffers.push(null);
        this._process();
      }
    };
    ChunkStream.prototype.destroySoon = ChunkStream.prototype.end;
    ChunkStream.prototype._end = function() {
      if (this._reads.length > 0) {
        this.emit("error", new Error("Unexpected end of input"));
      }
      this.destroy();
    };
    ChunkStream.prototype.destroy = function() {
      if (!this._buffers) {
        return;
      }
      this.writable = false;
      this._reads = null;
      this._buffers = null;
      this.emit("close");
    };
    ChunkStream.prototype._processReadAllowingLess = function(read) {
      this._reads.shift();
      let smallerBuf = this._buffers[0];
      if (smallerBuf.length > read.length) {
        this._buffered -= read.length;
        this._buffers[0] = smallerBuf.slice(read.length);
        read.func.call(this, smallerBuf.slice(0, read.length));
      } else {
        this._buffered -= smallerBuf.length;
        this._buffers.shift();
        read.func.call(this, smallerBuf);
      }
    };
    ChunkStream.prototype._processRead = function(read) {
      this._reads.shift();
      let pos = 0;
      let count = 0;
      let data = Buffer.alloc(read.length);
      while (pos < read.length) {
        let buf = this._buffers[count++];
        let len = Math.min(buf.length, read.length - pos);
        buf.copy(data, pos, 0, len);
        pos += len;
        if (len !== buf.length) {
          this._buffers[--count] = buf.slice(len);
        }
      }
      if (count > 0) {
        this._buffers.splice(0, count);
      }
      this._buffered -= read.length;
      read.func.call(this, data);
    };
    ChunkStream.prototype._process = function() {
      try {
        while (this._buffered > 0 && this._reads && this._reads.length > 0) {
          let read = this._reads[0];
          if (read.allowLess) {
            this._processReadAllowingLess(read);
          } else if (this._buffered >= read.length) {
            this._processRead(read);
          } else {
            break;
          }
        }
        if (this._buffers && !this.writable) {
          this._end();
        }
      } catch (ex) {
        this.emit("error", ex);
      }
    };
  }
});

// node_modules/pngjs/lib/interlace.js
var require_interlace = __commonJS({
  "node_modules/pngjs/lib/interlace.js"(exports2) {
    "use strict";
    var imagePasses = [
      {
        // pass 1 - 1px
        x: [0],
        y: [0]
      },
      {
        // pass 2 - 1px
        x: [4],
        y: [0]
      },
      {
        // pass 3 - 2px
        x: [0, 4],
        y: [4]
      },
      {
        // pass 4 - 4px
        x: [2, 6],
        y: [0, 4]
      },
      {
        // pass 5 - 8px
        x: [0, 2, 4, 6],
        y: [2, 6]
      },
      {
        // pass 6 - 16px
        x: [1, 3, 5, 7],
        y: [0, 2, 4, 6]
      },
      {
        // pass 7 - 32px
        x: [0, 1, 2, 3, 4, 5, 6, 7],
        y: [1, 3, 5, 7]
      }
    ];
    exports2.getImagePasses = function(width, height) {
      let images = [];
      let xLeftOver = width % 8;
      let yLeftOver = height % 8;
      let xRepeats = (width - xLeftOver) / 8;
      let yRepeats = (height - yLeftOver) / 8;
      for (let i = 0; i < imagePasses.length; i++) {
        let pass = imagePasses[i];
        let passWidth = xRepeats * pass.x.length;
        let passHeight = yRepeats * pass.y.length;
        for (let j = 0; j < pass.x.length; j++) {
          if (pass.x[j] < xLeftOver) {
            passWidth++;
          } else {
            break;
          }
        }
        for (let j = 0; j < pass.y.length; j++) {
          if (pass.y[j] < yLeftOver) {
            passHeight++;
          } else {
            break;
          }
        }
        if (passWidth > 0 && passHeight > 0) {
          images.push({ width: passWidth, height: passHeight, index: i });
        }
      }
      return images;
    };
    exports2.getInterlaceIterator = function(width) {
      return function(x, y, pass) {
        let outerXLeftOver = x % imagePasses[pass].x.length;
        let outerX = (x - outerXLeftOver) / imagePasses[pass].x.length * 8 + imagePasses[pass].x[outerXLeftOver];
        let outerYLeftOver = y % imagePasses[pass].y.length;
        let outerY = (y - outerYLeftOver) / imagePasses[pass].y.length * 8 + imagePasses[pass].y[outerYLeftOver];
        return outerX * 4 + outerY * width * 4;
      };
    };
  }
});

// node_modules/pngjs/lib/paeth-predictor.js
var require_paeth_predictor = __commonJS({
  "node_modules/pngjs/lib/paeth-predictor.js"(exports2, module2) {
    "use strict";
    module2.exports = function paethPredictor(left, above, upLeft) {
      let paeth = left + above - upLeft;
      let pLeft = Math.abs(paeth - left);
      let pAbove = Math.abs(paeth - above);
      let pUpLeft = Math.abs(paeth - upLeft);
      if (pLeft <= pAbove && pLeft <= pUpLeft) {
        return left;
      }
      if (pAbove <= pUpLeft) {
        return above;
      }
      return upLeft;
    };
  }
});

// node_modules/pngjs/lib/filter-parse.js
var require_filter_parse = __commonJS({
  "node_modules/pngjs/lib/filter-parse.js"(exports2, module2) {
    "use strict";
    var interlaceUtils = require_interlace();
    var paethPredictor = require_paeth_predictor();
    function getByteWidth(width, bpp, depth) {
      let byteWidth = width * bpp;
      if (depth !== 8) {
        byteWidth = Math.ceil(byteWidth / (8 / depth));
      }
      return byteWidth;
    }
    var Filter = module2.exports = function(bitmapInfo, dependencies) {
      let width = bitmapInfo.width;
      let height = bitmapInfo.height;
      let interlace = bitmapInfo.interlace;
      let bpp = bitmapInfo.bpp;
      let depth = bitmapInfo.depth;
      this.read = dependencies.read;
      this.write = dependencies.write;
      this.complete = dependencies.complete;
      this._imageIndex = 0;
      this._images = [];
      if (interlace) {
        let passes = interlaceUtils.getImagePasses(width, height);
        for (let i = 0; i < passes.length; i++) {
          this._images.push({
            byteWidth: getByteWidth(passes[i].width, bpp, depth),
            height: passes[i].height,
            lineIndex: 0
          });
        }
      } else {
        this._images.push({
          byteWidth: getByteWidth(width, bpp, depth),
          height,
          lineIndex: 0
        });
      }
      if (depth === 8) {
        this._xComparison = bpp;
      } else if (depth === 16) {
        this._xComparison = bpp * 2;
      } else {
        this._xComparison = 1;
      }
    };
    Filter.prototype.start = function() {
      this.read(
        this._images[this._imageIndex].byteWidth + 1,
        this._reverseFilterLine.bind(this)
      );
    };
    Filter.prototype._unFilterType1 = function(rawData, unfilteredLine, byteWidth) {
      let xComparison = this._xComparison;
      let xBiggerThan = xComparison - 1;
      for (let x = 0; x < byteWidth; x++) {
        let rawByte = rawData[1 + x];
        let f1Left = x > xBiggerThan ? unfilteredLine[x - xComparison] : 0;
        unfilteredLine[x] = rawByte + f1Left;
      }
    };
    Filter.prototype._unFilterType2 = function(rawData, unfilteredLine, byteWidth) {
      let lastLine = this._lastLine;
      for (let x = 0; x < byteWidth; x++) {
        let rawByte = rawData[1 + x];
        let f2Up = lastLine ? lastLine[x] : 0;
        unfilteredLine[x] = rawByte + f2Up;
      }
    };
    Filter.prototype._unFilterType3 = function(rawData, unfilteredLine, byteWidth) {
      let xComparison = this._xComparison;
      let xBiggerThan = xComparison - 1;
      let lastLine = this._lastLine;
      for (let x = 0; x < byteWidth; x++) {
        let rawByte = rawData[1 + x];
        let f3Up = lastLine ? lastLine[x] : 0;
        let f3Left = x > xBiggerThan ? unfilteredLine[x - xComparison] : 0;
        let f3Add = Math.floor((f3Left + f3Up) / 2);
        unfilteredLine[x] = rawByte + f3Add;
      }
    };
    Filter.prototype._unFilterType4 = function(rawData, unfilteredLine, byteWidth) {
      let xComparison = this._xComparison;
      let xBiggerThan = xComparison - 1;
      let lastLine = this._lastLine;
      for (let x = 0; x < byteWidth; x++) {
        let rawByte = rawData[1 + x];
        let f4Up = lastLine ? lastLine[x] : 0;
        let f4Left = x > xBiggerThan ? unfilteredLine[x - xComparison] : 0;
        let f4UpLeft = x > xBiggerThan && lastLine ? lastLine[x - xComparison] : 0;
        let f4Add = paethPredictor(f4Left, f4Up, f4UpLeft);
        unfilteredLine[x] = rawByte + f4Add;
      }
    };
    Filter.prototype._reverseFilterLine = function(rawData) {
      let filter = rawData[0];
      let unfilteredLine;
      let currentImage = this._images[this._imageIndex];
      let byteWidth = currentImage.byteWidth;
      if (filter === 0) {
        unfilteredLine = rawData.slice(1, byteWidth + 1);
      } else {
        unfilteredLine = Buffer.alloc(byteWidth);
        switch (filter) {
          case 1:
            this._unFilterType1(rawData, unfilteredLine, byteWidth);
            break;
          case 2:
            this._unFilterType2(rawData, unfilteredLine, byteWidth);
            break;
          case 3:
            this._unFilterType3(rawData, unfilteredLine, byteWidth);
            break;
          case 4:
            this._unFilterType4(rawData, unfilteredLine, byteWidth);
            break;
          default:
            throw new Error("Unrecognised filter type - " + filter);
        }
      }
      this.write(unfilteredLine);
      currentImage.lineIndex++;
      if (currentImage.lineIndex >= currentImage.height) {
        this._lastLine = null;
        this._imageIndex++;
        currentImage = this._images[this._imageIndex];
      } else {
        this._lastLine = unfilteredLine;
      }
      if (currentImage) {
        this.read(currentImage.byteWidth + 1, this._reverseFilterLine.bind(this));
      } else {
        this._lastLine = null;
        this.complete();
      }
    };
  }
});

// node_modules/pngjs/lib/filter-parse-async.js
var require_filter_parse_async = __commonJS({
  "node_modules/pngjs/lib/filter-parse-async.js"(exports2, module2) {
    "use strict";
    var util = require("util");
    var ChunkStream = require_chunkstream();
    var Filter = require_filter_parse();
    var FilterAsync = module2.exports = function(bitmapInfo) {
      ChunkStream.call(this);
      let buffers = [];
      let that = this;
      this._filter = new Filter(bitmapInfo, {
        read: this.read.bind(this),
        write: function(buffer) {
          buffers.push(buffer);
        },
        complete: function() {
          that.emit("complete", Buffer.concat(buffers));
        }
      });
      this._filter.start();
    };
    util.inherits(FilterAsync, ChunkStream);
  }
});

// node_modules/pngjs/lib/constants.js
var require_constants = __commonJS({
  "node_modules/pngjs/lib/constants.js"(exports2, module2) {
    "use strict";
    module2.exports = {
      PNG_SIGNATURE: [137, 80, 78, 71, 13, 10, 26, 10],
      TYPE_IHDR: 1229472850,
      TYPE_IEND: 1229278788,
      TYPE_IDAT: 1229209940,
      TYPE_PLTE: 1347179589,
      TYPE_tRNS: 1951551059,
      // eslint-disable-line camelcase
      TYPE_gAMA: 1732332865,
      // eslint-disable-line camelcase
      // color-type bits
      COLORTYPE_GRAYSCALE: 0,
      COLORTYPE_PALETTE: 1,
      COLORTYPE_COLOR: 2,
      COLORTYPE_ALPHA: 4,
      // e.g. grayscale and alpha
      // color-type combinations
      COLORTYPE_PALETTE_COLOR: 3,
      COLORTYPE_COLOR_ALPHA: 6,
      COLORTYPE_TO_BPP_MAP: {
        0: 1,
        2: 3,
        3: 1,
        4: 2,
        6: 4
      },
      GAMMA_DIVISION: 1e5
    };
  }
});

// node_modules/pngjs/lib/crc.js
var require_crc = __commonJS({
  "node_modules/pngjs/lib/crc.js"(exports2, module2) {
    "use strict";
    var crcTable = [];
    (function() {
      for (let i = 0; i < 256; i++) {
        let currentCrc = i;
        for (let j = 0; j < 8; j++) {
          if (currentCrc & 1) {
            currentCrc = 3988292384 ^ currentCrc >>> 1;
          } else {
            currentCrc = currentCrc >>> 1;
          }
        }
        crcTable[i] = currentCrc;
      }
    })();
    var CrcCalculator = module2.exports = function() {
      this._crc = -1;
    };
    CrcCalculator.prototype.write = function(data) {
      for (let i = 0; i < data.length; i++) {
        this._crc = crcTable[(this._crc ^ data[i]) & 255] ^ this._crc >>> 8;
      }
      return true;
    };
    CrcCalculator.prototype.crc32 = function() {
      return this._crc ^ -1;
    };
    CrcCalculator.crc32 = function(buf) {
      let crc = -1;
      for (let i = 0; i < buf.length; i++) {
        crc = crcTable[(crc ^ buf[i]) & 255] ^ crc >>> 8;
      }
      return crc ^ -1;
    };
  }
});

// node_modules/pngjs/lib/parser.js
var require_parser = __commonJS({
  "node_modules/pngjs/lib/parser.js"(exports2, module2) {
    "use strict";
    var constants = require_constants();
    var CrcCalculator = require_crc();
    var Parser = module2.exports = function(options, dependencies) {
      this._options = options;
      options.checkCRC = options.checkCRC !== false;
      this._hasIHDR = false;
      this._hasIEND = false;
      this._emittedHeadersFinished = false;
      this._palette = [];
      this._colorType = 0;
      this._chunks = {};
      this._chunks[constants.TYPE_IHDR] = this._handleIHDR.bind(this);
      this._chunks[constants.TYPE_IEND] = this._handleIEND.bind(this);
      this._chunks[constants.TYPE_IDAT] = this._handleIDAT.bind(this);
      this._chunks[constants.TYPE_PLTE] = this._handlePLTE.bind(this);
      this._chunks[constants.TYPE_tRNS] = this._handleTRNS.bind(this);
      this._chunks[constants.TYPE_gAMA] = this._handleGAMA.bind(this);
      this.read = dependencies.read;
      this.error = dependencies.error;
      this.metadata = dependencies.metadata;
      this.gamma = dependencies.gamma;
      this.transColor = dependencies.transColor;
      this.palette = dependencies.palette;
      this.parsed = dependencies.parsed;
      this.inflateData = dependencies.inflateData;
      this.finished = dependencies.finished;
      this.simpleTransparency = dependencies.simpleTransparency;
      this.headersFinished = dependencies.headersFinished || function() {
      };
    };
    Parser.prototype.start = function() {
      this.read(constants.PNG_SIGNATURE.length, this._parseSignature.bind(this));
    };
    Parser.prototype._parseSignature = function(data) {
      let signature = constants.PNG_SIGNATURE;
      for (let i = 0; i < signature.length; i++) {
        if (data[i] !== signature[i]) {
          this.error(new Error("Invalid file signature"));
          return;
        }
      }
      this.read(8, this._parseChunkBegin.bind(this));
    };
    Parser.prototype._parseChunkBegin = function(data) {
      let length = data.readUInt32BE(0);
      let type = data.readUInt32BE(4);
      let name = "";
      for (let i = 4; i < 8; i++) {
        name += String.fromCharCode(data[i]);
      }
      let ancillary = Boolean(data[4] & 32);
      if (!this._hasIHDR && type !== constants.TYPE_IHDR) {
        this.error(new Error("Expected IHDR on beggining"));
        return;
      }
      this._crc = new CrcCalculator();
      this._crc.write(Buffer.from(name));
      if (this._chunks[type]) {
        return this._chunks[type](length);
      }
      if (!ancillary) {
        this.error(new Error("Unsupported critical chunk type " + name));
        return;
      }
      this.read(length + 4, this._skipChunk.bind(this));
    };
    Parser.prototype._skipChunk = function() {
      this.read(8, this._parseChunkBegin.bind(this));
    };
    Parser.prototype._handleChunkEnd = function() {
      this.read(4, this._parseChunkEnd.bind(this));
    };
    Parser.prototype._parseChunkEnd = function(data) {
      let fileCrc = data.readInt32BE(0);
      let calcCrc = this._crc.crc32();
      if (this._options.checkCRC && calcCrc !== fileCrc) {
        this.error(new Error("Crc error - " + fileCrc + " - " + calcCrc));
        return;
      }
      if (!this._hasIEND) {
        this.read(8, this._parseChunkBegin.bind(this));
      }
    };
    Parser.prototype._handleIHDR = function(length) {
      this.read(length, this._parseIHDR.bind(this));
    };
    Parser.prototype._parseIHDR = function(data) {
      this._crc.write(data);
      let width = data.readUInt32BE(0);
      let height = data.readUInt32BE(4);
      let depth = data[8];
      let colorType = data[9];
      let compr = data[10];
      let filter = data[11];
      let interlace = data[12];
      if (depth !== 8 && depth !== 4 && depth !== 2 && depth !== 1 && depth !== 16) {
        this.error(new Error("Unsupported bit depth " + depth));
        return;
      }
      if (!(colorType in constants.COLORTYPE_TO_BPP_MAP)) {
        this.error(new Error("Unsupported color type"));
        return;
      }
      if (compr !== 0) {
        this.error(new Error("Unsupported compression method"));
        return;
      }
      if (filter !== 0) {
        this.error(new Error("Unsupported filter method"));
        return;
      }
      if (interlace !== 0 && interlace !== 1) {
        this.error(new Error("Unsupported interlace method"));
        return;
      }
      this._colorType = colorType;
      let bpp = constants.COLORTYPE_TO_BPP_MAP[this._colorType];
      this._hasIHDR = true;
      this.metadata({
        width,
        height,
        depth,
        interlace: Boolean(interlace),
        palette: Boolean(colorType & constants.COLORTYPE_PALETTE),
        color: Boolean(colorType & constants.COLORTYPE_COLOR),
        alpha: Boolean(colorType & constants.COLORTYPE_ALPHA),
        bpp,
        colorType
      });
      this._handleChunkEnd();
    };
    Parser.prototype._handlePLTE = function(length) {
      this.read(length, this._parsePLTE.bind(this));
    };
    Parser.prototype._parsePLTE = function(data) {
      this._crc.write(data);
      let entries = Math.floor(data.length / 3);
      for (let i = 0; i < entries; i++) {
        this._palette.push([data[i * 3], data[i * 3 + 1], data[i * 3 + 2], 255]);
      }
      this.palette(this._palette);
      this._handleChunkEnd();
    };
    Parser.prototype._handleTRNS = function(length) {
      this.simpleTransparency();
      this.read(length, this._parseTRNS.bind(this));
    };
    Parser.prototype._parseTRNS = function(data) {
      this._crc.write(data);
      if (this._colorType === constants.COLORTYPE_PALETTE_COLOR) {
        if (this._palette.length === 0) {
          this.error(new Error("Transparency chunk must be after palette"));
          return;
        }
        if (data.length > this._palette.length) {
          this.error(new Error("More transparent colors than palette size"));
          return;
        }
        for (let i = 0; i < data.length; i++) {
          this._palette[i][3] = data[i];
        }
        this.palette(this._palette);
      }
      if (this._colorType === constants.COLORTYPE_GRAYSCALE) {
        this.transColor([data.readUInt16BE(0)]);
      }
      if (this._colorType === constants.COLORTYPE_COLOR) {
        this.transColor([
          data.readUInt16BE(0),
          data.readUInt16BE(2),
          data.readUInt16BE(4)
        ]);
      }
      this._handleChunkEnd();
    };
    Parser.prototype._handleGAMA = function(length) {
      this.read(length, this._parseGAMA.bind(this));
    };
    Parser.prototype._parseGAMA = function(data) {
      this._crc.write(data);
      this.gamma(data.readUInt32BE(0) / constants.GAMMA_DIVISION);
      this._handleChunkEnd();
    };
    Parser.prototype._handleIDAT = function(length) {
      if (!this._emittedHeadersFinished) {
        this._emittedHeadersFinished = true;
        this.headersFinished();
      }
      this.read(-length, this._parseIDAT.bind(this, length));
    };
    Parser.prototype._parseIDAT = function(length, data) {
      this._crc.write(data);
      if (this._colorType === constants.COLORTYPE_PALETTE_COLOR && this._palette.length === 0) {
        throw new Error("Expected palette not found");
      }
      this.inflateData(data);
      let leftOverLength = length - data.length;
      if (leftOverLength > 0) {
        this._handleIDAT(leftOverLength);
      } else {
        this._handleChunkEnd();
      }
    };
    Parser.prototype._handleIEND = function(length) {
      this.read(length, this._parseIEND.bind(this));
    };
    Parser.prototype._parseIEND = function(data) {
      this._crc.write(data);
      this._hasIEND = true;
      this._handleChunkEnd();
      if (this.finished) {
        this.finished();
      }
    };
  }
});

// node_modules/pngjs/lib/bitmapper.js
var require_bitmapper = __commonJS({
  "node_modules/pngjs/lib/bitmapper.js"(exports2) {
    "use strict";
    var interlaceUtils = require_interlace();
    var pixelBppMapper = [
      // 0 - dummy entry
      function() {
      },
      // 1 - L
      // 0: 0, 1: 0, 2: 0, 3: 0xff
      function(pxData, data, pxPos, rawPos) {
        if (rawPos === data.length) {
          throw new Error("Ran out of data");
        }
        let pixel = data[rawPos];
        pxData[pxPos] = pixel;
        pxData[pxPos + 1] = pixel;
        pxData[pxPos + 2] = pixel;
        pxData[pxPos + 3] = 255;
      },
      // 2 - LA
      // 0: 0, 1: 0, 2: 0, 3: 1
      function(pxData, data, pxPos, rawPos) {
        if (rawPos + 1 >= data.length) {
          throw new Error("Ran out of data");
        }
        let pixel = data[rawPos];
        pxData[pxPos] = pixel;
        pxData[pxPos + 1] = pixel;
        pxData[pxPos + 2] = pixel;
        pxData[pxPos + 3] = data[rawPos + 1];
      },
      // 3 - RGB
      // 0: 0, 1: 1, 2: 2, 3: 0xff
      function(pxData, data, pxPos, rawPos) {
        if (rawPos + 2 >= data.length) {
          throw new Error("Ran out of data");
        }
        pxData[pxPos] = data[rawPos];
        pxData[pxPos + 1] = data[rawPos + 1];
        pxData[pxPos + 2] = data[rawPos + 2];
        pxData[pxPos + 3] = 255;
      },
      // 4 - RGBA
      // 0: 0, 1: 1, 2: 2, 3: 3
      function(pxData, data, pxPos, rawPos) {
        if (rawPos + 3 >= data.length) {
          throw new Error("Ran out of data");
        }
        pxData[pxPos] = data[rawPos];
        pxData[pxPos + 1] = data[rawPos + 1];
        pxData[pxPos + 2] = data[rawPos + 2];
        pxData[pxPos + 3] = data[rawPos + 3];
      }
    ];
    var pixelBppCustomMapper = [
      // 0 - dummy entry
      function() {
      },
      // 1 - L
      // 0: 0, 1: 0, 2: 0, 3: 0xff
      function(pxData, pixelData, pxPos, maxBit) {
        let pixel = pixelData[0];
        pxData[pxPos] = pixel;
        pxData[pxPos + 1] = pixel;
        pxData[pxPos + 2] = pixel;
        pxData[pxPos + 3] = maxBit;
      },
      // 2 - LA
      // 0: 0, 1: 0, 2: 0, 3: 1
      function(pxData, pixelData, pxPos) {
        let pixel = pixelData[0];
        pxData[pxPos] = pixel;
        pxData[pxPos + 1] = pixel;
        pxData[pxPos + 2] = pixel;
        pxData[pxPos + 3] = pixelData[1];
      },
      // 3 - RGB
      // 0: 0, 1: 1, 2: 2, 3: 0xff
      function(pxData, pixelData, pxPos, maxBit) {
        pxData[pxPos] = pixelData[0];
        pxData[pxPos + 1] = pixelData[1];
        pxData[pxPos + 2] = pixelData[2];
        pxData[pxPos + 3] = maxBit;
      },
      // 4 - RGBA
      // 0: 0, 1: 1, 2: 2, 3: 3
      function(pxData, pixelData, pxPos) {
        pxData[pxPos] = pixelData[0];
        pxData[pxPos + 1] = pixelData[1];
        pxData[pxPos + 2] = pixelData[2];
        pxData[pxPos + 3] = pixelData[3];
      }
    ];
    function bitRetriever(data, depth) {
      let leftOver = [];
      let i = 0;
      function split() {
        if (i === data.length) {
          throw new Error("Ran out of data");
        }
        let byte = data[i];
        i++;
        let byte8, byte7, byte6, byte5, byte4, byte3, byte2, byte1;
        switch (depth) {
          default:
            throw new Error("unrecognised depth");
          case 16:
            byte2 = data[i];
            i++;
            leftOver.push((byte << 8) + byte2);
            break;
          case 4:
            byte2 = byte & 15;
            byte1 = byte >> 4;
            leftOver.push(byte1, byte2);
            break;
          case 2:
            byte4 = byte & 3;
            byte3 = byte >> 2 & 3;
            byte2 = byte >> 4 & 3;
            byte1 = byte >> 6 & 3;
            leftOver.push(byte1, byte2, byte3, byte4);
            break;
          case 1:
            byte8 = byte & 1;
            byte7 = byte >> 1 & 1;
            byte6 = byte >> 2 & 1;
            byte5 = byte >> 3 & 1;
            byte4 = byte >> 4 & 1;
            byte3 = byte >> 5 & 1;
            byte2 = byte >> 6 & 1;
            byte1 = byte >> 7 & 1;
            leftOver.push(byte1, byte2, byte3, byte4, byte5, byte6, byte7, byte8);
            break;
        }
      }
      return {
        get: function(count) {
          while (leftOver.length < count) {
            split();
          }
          let returner = leftOver.slice(0, count);
          leftOver = leftOver.slice(count);
          return returner;
        },
        resetAfterLine: function() {
          leftOver.length = 0;
        },
        end: function() {
          if (i !== data.length) {
            throw new Error("extra data found");
          }
        }
      };
    }
    function mapImage8Bit(image, pxData, getPxPos, bpp, data, rawPos) {
      let imageWidth = image.width;
      let imageHeight = image.height;
      let imagePass = image.index;
      for (let y = 0; y < imageHeight; y++) {
        for (let x = 0; x < imageWidth; x++) {
          let pxPos = getPxPos(x, y, imagePass);
          pixelBppMapper[bpp](pxData, data, pxPos, rawPos);
          rawPos += bpp;
        }
      }
      return rawPos;
    }
    function mapImageCustomBit(image, pxData, getPxPos, bpp, bits, maxBit) {
      let imageWidth = image.width;
      let imageHeight = image.height;
      let imagePass = image.index;
      for (let y = 0; y < imageHeight; y++) {
        for (let x = 0; x < imageWidth; x++) {
          let pixelData = bits.get(bpp);
          let pxPos = getPxPos(x, y, imagePass);
          pixelBppCustomMapper[bpp](pxData, pixelData, pxPos, maxBit);
        }
        bits.resetAfterLine();
      }
    }
    exports2.dataToBitMap = function(data, bitmapInfo) {
      let width = bitmapInfo.width;
      let height = bitmapInfo.height;
      let depth = bitmapInfo.depth;
      let bpp = bitmapInfo.bpp;
      let interlace = bitmapInfo.interlace;
      let bits;
      if (depth !== 8) {
        bits = bitRetriever(data, depth);
      }
      let pxData;
      if (depth <= 8) {
        pxData = Buffer.alloc(width * height * 4);
      } else {
        pxData = new Uint16Array(width * height * 4);
      }
      let maxBit = Math.pow(2, depth) - 1;
      let rawPos = 0;
      let images;
      let getPxPos;
      if (interlace) {
        images = interlaceUtils.getImagePasses(width, height);
        getPxPos = interlaceUtils.getInterlaceIterator(width, height);
      } else {
        let nonInterlacedPxPos = 0;
        getPxPos = function() {
          let returner = nonInterlacedPxPos;
          nonInterlacedPxPos += 4;
          return returner;
        };
        images = [{ width, height }];
      }
      for (let imageIndex = 0; imageIndex < images.length; imageIndex++) {
        if (depth === 8) {
          rawPos = mapImage8Bit(
            images[imageIndex],
            pxData,
            getPxPos,
            bpp,
            data,
            rawPos
          );
        } else {
          mapImageCustomBit(
            images[imageIndex],
            pxData,
            getPxPos,
            bpp,
            bits,
            maxBit
          );
        }
      }
      if (depth === 8) {
        if (rawPos !== data.length) {
          throw new Error("extra data found");
        }
      } else {
        bits.end();
      }
      return pxData;
    };
  }
});

// node_modules/pngjs/lib/format-normaliser.js
var require_format_normaliser = __commonJS({
  "node_modules/pngjs/lib/format-normaliser.js"(exports2, module2) {
    "use strict";
    function dePalette(indata, outdata, width, height, palette) {
      let pxPos = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let color = palette[indata[pxPos]];
          if (!color) {
            throw new Error("index " + indata[pxPos] + " not in palette");
          }
          for (let i = 0; i < 4; i++) {
            outdata[pxPos + i] = color[i];
          }
          pxPos += 4;
        }
      }
    }
    function replaceTransparentColor(indata, outdata, width, height, transColor) {
      let pxPos = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let makeTrans = false;
          if (transColor.length === 1) {
            if (transColor[0] === indata[pxPos]) {
              makeTrans = true;
            }
          } else if (transColor[0] === indata[pxPos] && transColor[1] === indata[pxPos + 1] && transColor[2] === indata[pxPos + 2]) {
            makeTrans = true;
          }
          if (makeTrans) {
            for (let i = 0; i < 4; i++) {
              outdata[pxPos + i] = 0;
            }
          }
          pxPos += 4;
        }
      }
    }
    function scaleDepth(indata, outdata, width, height, depth) {
      let maxOutSample = 255;
      let maxInSample = Math.pow(2, depth) - 1;
      let pxPos = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          for (let i = 0; i < 4; i++) {
            outdata[pxPos + i] = Math.floor(
              indata[pxPos + i] * maxOutSample / maxInSample + 0.5
            );
          }
          pxPos += 4;
        }
      }
    }
    module2.exports = function(indata, imageData, skipRescale = false) {
      let depth = imageData.depth;
      let width = imageData.width;
      let height = imageData.height;
      let colorType = imageData.colorType;
      let transColor = imageData.transColor;
      let palette = imageData.palette;
      let outdata = indata;
      if (colorType === 3) {
        dePalette(indata, outdata, width, height, palette);
      } else {
        if (transColor) {
          replaceTransparentColor(indata, outdata, width, height, transColor);
        }
        if (depth !== 8 && !skipRescale) {
          if (depth === 16) {
            outdata = Buffer.alloc(width * height * 4);
          }
          scaleDepth(indata, outdata, width, height, depth);
        }
      }
      return outdata;
    };
  }
});

// node_modules/pngjs/lib/parser-async.js
var require_parser_async = __commonJS({
  "node_modules/pngjs/lib/parser-async.js"(exports2, module2) {
    "use strict";
    var util = require("util");
    var zlib = require("zlib");
    var ChunkStream = require_chunkstream();
    var FilterAsync = require_filter_parse_async();
    var Parser = require_parser();
    var bitmapper = require_bitmapper();
    var formatNormaliser = require_format_normaliser();
    var ParserAsync = module2.exports = function(options) {
      ChunkStream.call(this);
      this._parser = new Parser(options, {
        read: this.read.bind(this),
        error: this._handleError.bind(this),
        metadata: this._handleMetaData.bind(this),
        gamma: this.emit.bind(this, "gamma"),
        palette: this._handlePalette.bind(this),
        transColor: this._handleTransColor.bind(this),
        finished: this._finished.bind(this),
        inflateData: this._inflateData.bind(this),
        simpleTransparency: this._simpleTransparency.bind(this),
        headersFinished: this._headersFinished.bind(this)
      });
      this._options = options;
      this.writable = true;
      this._parser.start();
    };
    util.inherits(ParserAsync, ChunkStream);
    ParserAsync.prototype._handleError = function(err) {
      this.emit("error", err);
      this.writable = false;
      this.destroy();
      if (this._inflate && this._inflate.destroy) {
        this._inflate.destroy();
      }
      if (this._filter) {
        this._filter.destroy();
        this._filter.on("error", function() {
        });
      }
      this.errord = true;
    };
    ParserAsync.prototype._inflateData = function(data) {
      if (!this._inflate) {
        if (this._bitmapInfo.interlace) {
          this._inflate = zlib.createInflate();
          this._inflate.on("error", this.emit.bind(this, "error"));
          this._filter.on("complete", this._complete.bind(this));
          this._inflate.pipe(this._filter);
        } else {
          let rowSize = (this._bitmapInfo.width * this._bitmapInfo.bpp * this._bitmapInfo.depth + 7 >> 3) + 1;
          let imageSize = rowSize * this._bitmapInfo.height;
          let chunkSize = Math.max(imageSize, zlib.Z_MIN_CHUNK);
          this._inflate = zlib.createInflate({ chunkSize });
          let leftToInflate = imageSize;
          let emitError = this.emit.bind(this, "error");
          this._inflate.on("error", function(err) {
            if (!leftToInflate) {
              return;
            }
            emitError(err);
          });
          this._filter.on("complete", this._complete.bind(this));
          let filterWrite = this._filter.write.bind(this._filter);
          this._inflate.on("data", function(chunk) {
            if (!leftToInflate) {
              return;
            }
            if (chunk.length > leftToInflate) {
              chunk = chunk.slice(0, leftToInflate);
            }
            leftToInflate -= chunk.length;
            filterWrite(chunk);
          });
          this._inflate.on("end", this._filter.end.bind(this._filter));
        }
      }
      this._inflate.write(data);
    };
    ParserAsync.prototype._handleMetaData = function(metaData) {
      this._metaData = metaData;
      this._bitmapInfo = Object.create(metaData);
      this._filter = new FilterAsync(this._bitmapInfo);
    };
    ParserAsync.prototype._handleTransColor = function(transColor) {
      this._bitmapInfo.transColor = transColor;
    };
    ParserAsync.prototype._handlePalette = function(palette) {
      this._bitmapInfo.palette = palette;
    };
    ParserAsync.prototype._simpleTransparency = function() {
      this._metaData.alpha = true;
    };
    ParserAsync.prototype._headersFinished = function() {
      this.emit("metadata", this._metaData);
    };
    ParserAsync.prototype._finished = function() {
      if (this.errord) {
        return;
      }
      if (!this._inflate) {
        this.emit("error", "No Inflate block");
      } else {
        this._inflate.end();
      }
    };
    ParserAsync.prototype._complete = function(filteredData) {
      if (this.errord) {
        return;
      }
      let normalisedBitmapData;
      try {
        let bitmapData = bitmapper.dataToBitMap(filteredData, this._bitmapInfo);
        normalisedBitmapData = formatNormaliser(
          bitmapData,
          this._bitmapInfo,
          this._options.skipRescale
        );
        bitmapData = null;
      } catch (ex) {
        this._handleError(ex);
        return;
      }
      this.emit("parsed", normalisedBitmapData);
    };
  }
});

// node_modules/pngjs/lib/bitpacker.js
var require_bitpacker = __commonJS({
  "node_modules/pngjs/lib/bitpacker.js"(exports2, module2) {
    "use strict";
    var constants = require_constants();
    module2.exports = function(dataIn, width, height, options) {
      let outHasAlpha = [constants.COLORTYPE_COLOR_ALPHA, constants.COLORTYPE_ALPHA].indexOf(
        options.colorType
      ) !== -1;
      if (options.colorType === options.inputColorType) {
        let bigEndian = (function() {
          let buffer = new ArrayBuffer(2);
          new DataView(buffer).setInt16(
            0,
            256,
            true
            /* littleEndian */
          );
          return new Int16Array(buffer)[0] !== 256;
        })();
        if (options.bitDepth === 8 || options.bitDepth === 16 && bigEndian) {
          return dataIn;
        }
      }
      let data = options.bitDepth !== 16 ? dataIn : new Uint16Array(dataIn.buffer);
      let maxValue = 255;
      let inBpp = constants.COLORTYPE_TO_BPP_MAP[options.inputColorType];
      if (inBpp === 4 && !options.inputHasAlpha) {
        inBpp = 3;
      }
      let outBpp = constants.COLORTYPE_TO_BPP_MAP[options.colorType];
      if (options.bitDepth === 16) {
        maxValue = 65535;
        outBpp *= 2;
      }
      let outData = Buffer.alloc(width * height * outBpp);
      let inIndex = 0;
      let outIndex = 0;
      let bgColor = options.bgColor || {};
      if (bgColor.red === void 0) {
        bgColor.red = maxValue;
      }
      if (bgColor.green === void 0) {
        bgColor.green = maxValue;
      }
      if (bgColor.blue === void 0) {
        bgColor.blue = maxValue;
      }
      function getRGBA() {
        let red;
        let green;
        let blue;
        let alpha = maxValue;
        switch (options.inputColorType) {
          case constants.COLORTYPE_COLOR_ALPHA:
            alpha = data[inIndex + 3];
            red = data[inIndex];
            green = data[inIndex + 1];
            blue = data[inIndex + 2];
            break;
          case constants.COLORTYPE_COLOR:
            red = data[inIndex];
            green = data[inIndex + 1];
            blue = data[inIndex + 2];
            break;
          case constants.COLORTYPE_ALPHA:
            alpha = data[inIndex + 1];
            red = data[inIndex];
            green = red;
            blue = red;
            break;
          case constants.COLORTYPE_GRAYSCALE:
            red = data[inIndex];
            green = red;
            blue = red;
            break;
          default:
            throw new Error(
              "input color type:" + options.inputColorType + " is not supported at present"
            );
        }
        if (options.inputHasAlpha) {
          if (!outHasAlpha) {
            alpha /= maxValue;
            red = Math.min(
              Math.max(Math.round((1 - alpha) * bgColor.red + alpha * red), 0),
              maxValue
            );
            green = Math.min(
              Math.max(Math.round((1 - alpha) * bgColor.green + alpha * green), 0),
              maxValue
            );
            blue = Math.min(
              Math.max(Math.round((1 - alpha) * bgColor.blue + alpha * blue), 0),
              maxValue
            );
          }
        }
        return { red, green, blue, alpha };
      }
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let rgba = getRGBA(data, inIndex);
          switch (options.colorType) {
            case constants.COLORTYPE_COLOR_ALPHA:
            case constants.COLORTYPE_COLOR:
              if (options.bitDepth === 8) {
                outData[outIndex] = rgba.red;
                outData[outIndex + 1] = rgba.green;
                outData[outIndex + 2] = rgba.blue;
                if (outHasAlpha) {
                  outData[outIndex + 3] = rgba.alpha;
                }
              } else {
                outData.writeUInt16BE(rgba.red, outIndex);
                outData.writeUInt16BE(rgba.green, outIndex + 2);
                outData.writeUInt16BE(rgba.blue, outIndex + 4);
                if (outHasAlpha) {
                  outData.writeUInt16BE(rgba.alpha, outIndex + 6);
                }
              }
              break;
            case constants.COLORTYPE_ALPHA:
            case constants.COLORTYPE_GRAYSCALE: {
              let grayscale = (rgba.red + rgba.green + rgba.blue) / 3;
              if (options.bitDepth === 8) {
                outData[outIndex] = grayscale;
                if (outHasAlpha) {
                  outData[outIndex + 1] = rgba.alpha;
                }
              } else {
                outData.writeUInt16BE(grayscale, outIndex);
                if (outHasAlpha) {
                  outData.writeUInt16BE(rgba.alpha, outIndex + 2);
                }
              }
              break;
            }
            default:
              throw new Error("unrecognised color Type " + options.colorType);
          }
          inIndex += inBpp;
          outIndex += outBpp;
        }
      }
      return outData;
    };
  }
});

// node_modules/pngjs/lib/filter-pack.js
var require_filter_pack = __commonJS({
  "node_modules/pngjs/lib/filter-pack.js"(exports2, module2) {
    "use strict";
    var paethPredictor = require_paeth_predictor();
    function filterNone(pxData, pxPos, byteWidth, rawData, rawPos) {
      for (let x = 0; x < byteWidth; x++) {
        rawData[rawPos + x] = pxData[pxPos + x];
      }
    }
    function filterSumNone(pxData, pxPos, byteWidth) {
      let sum = 0;
      let length = pxPos + byteWidth;
      for (let i = pxPos; i < length; i++) {
        sum += Math.abs(pxData[i]);
      }
      return sum;
    }
    function filterSub(pxData, pxPos, byteWidth, rawData, rawPos, bpp) {
      for (let x = 0; x < byteWidth; x++) {
        let left = x >= bpp ? pxData[pxPos + x - bpp] : 0;
        let val = pxData[pxPos + x] - left;
        rawData[rawPos + x] = val;
      }
    }
    function filterSumSub(pxData, pxPos, byteWidth, bpp) {
      let sum = 0;
      for (let x = 0; x < byteWidth; x++) {
        let left = x >= bpp ? pxData[pxPos + x - bpp] : 0;
        let val = pxData[pxPos + x] - left;
        sum += Math.abs(val);
      }
      return sum;
    }
    function filterUp(pxData, pxPos, byteWidth, rawData, rawPos) {
      for (let x = 0; x < byteWidth; x++) {
        let up = pxPos > 0 ? pxData[pxPos + x - byteWidth] : 0;
        let val = pxData[pxPos + x] - up;
        rawData[rawPos + x] = val;
      }
    }
    function filterSumUp(pxData, pxPos, byteWidth) {
      let sum = 0;
      let length = pxPos + byteWidth;
      for (let x = pxPos; x < length; x++) {
        let up = pxPos > 0 ? pxData[x - byteWidth] : 0;
        let val = pxData[x] - up;
        sum += Math.abs(val);
      }
      return sum;
    }
    function filterAvg(pxData, pxPos, byteWidth, rawData, rawPos, bpp) {
      for (let x = 0; x < byteWidth; x++) {
        let left = x >= bpp ? pxData[pxPos + x - bpp] : 0;
        let up = pxPos > 0 ? pxData[pxPos + x - byteWidth] : 0;
        let val = pxData[pxPos + x] - (left + up >> 1);
        rawData[rawPos + x] = val;
      }
    }
    function filterSumAvg(pxData, pxPos, byteWidth, bpp) {
      let sum = 0;
      for (let x = 0; x < byteWidth; x++) {
        let left = x >= bpp ? pxData[pxPos + x - bpp] : 0;
        let up = pxPos > 0 ? pxData[pxPos + x - byteWidth] : 0;
        let val = pxData[pxPos + x] - (left + up >> 1);
        sum += Math.abs(val);
      }
      return sum;
    }
    function filterPaeth(pxData, pxPos, byteWidth, rawData, rawPos, bpp) {
      for (let x = 0; x < byteWidth; x++) {
        let left = x >= bpp ? pxData[pxPos + x - bpp] : 0;
        let up = pxPos > 0 ? pxData[pxPos + x - byteWidth] : 0;
        let upleft = pxPos > 0 && x >= bpp ? pxData[pxPos + x - (byteWidth + bpp)] : 0;
        let val = pxData[pxPos + x] - paethPredictor(left, up, upleft);
        rawData[rawPos + x] = val;
      }
    }
    function filterSumPaeth(pxData, pxPos, byteWidth, bpp) {
      let sum = 0;
      for (let x = 0; x < byteWidth; x++) {
        let left = x >= bpp ? pxData[pxPos + x - bpp] : 0;
        let up = pxPos > 0 ? pxData[pxPos + x - byteWidth] : 0;
        let upleft = pxPos > 0 && x >= bpp ? pxData[pxPos + x - (byteWidth + bpp)] : 0;
        let val = pxData[pxPos + x] - paethPredictor(left, up, upleft);
        sum += Math.abs(val);
      }
      return sum;
    }
    var filters = {
      0: filterNone,
      1: filterSub,
      2: filterUp,
      3: filterAvg,
      4: filterPaeth
    };
    var filterSums = {
      0: filterSumNone,
      1: filterSumSub,
      2: filterSumUp,
      3: filterSumAvg,
      4: filterSumPaeth
    };
    module2.exports = function(pxData, width, height, options, bpp) {
      let filterTypes;
      if (!("filterType" in options) || options.filterType === -1) {
        filterTypes = [0, 1, 2, 3, 4];
      } else if (typeof options.filterType === "number") {
        filterTypes = [options.filterType];
      } else {
        throw new Error("unrecognised filter types");
      }
      if (options.bitDepth === 16) {
        bpp *= 2;
      }
      let byteWidth = width * bpp;
      let rawPos = 0;
      let pxPos = 0;
      let rawData = Buffer.alloc((byteWidth + 1) * height);
      let sel = filterTypes[0];
      for (let y = 0; y < height; y++) {
        if (filterTypes.length > 1) {
          let min = Infinity;
          for (let i = 0; i < filterTypes.length; i++) {
            let sum = filterSums[filterTypes[i]](pxData, pxPos, byteWidth, bpp);
            if (sum < min) {
              sel = filterTypes[i];
              min = sum;
            }
          }
        }
        rawData[rawPos] = sel;
        rawPos++;
        filters[sel](pxData, pxPos, byteWidth, rawData, rawPos, bpp);
        rawPos += byteWidth;
        pxPos += byteWidth;
      }
      return rawData;
    };
  }
});

// node_modules/pngjs/lib/packer.js
var require_packer = __commonJS({
  "node_modules/pngjs/lib/packer.js"(exports2, module2) {
    "use strict";
    var constants = require_constants();
    var CrcStream = require_crc();
    var bitPacker = require_bitpacker();
    var filter = require_filter_pack();
    var zlib = require("zlib");
    var Packer = module2.exports = function(options) {
      this._options = options;
      options.deflateChunkSize = options.deflateChunkSize || 32 * 1024;
      options.deflateLevel = options.deflateLevel != null ? options.deflateLevel : 9;
      options.deflateStrategy = options.deflateStrategy != null ? options.deflateStrategy : 3;
      options.inputHasAlpha = options.inputHasAlpha != null ? options.inputHasAlpha : true;
      options.deflateFactory = options.deflateFactory || zlib.createDeflate;
      options.bitDepth = options.bitDepth || 8;
      options.colorType = typeof options.colorType === "number" ? options.colorType : constants.COLORTYPE_COLOR_ALPHA;
      options.inputColorType = typeof options.inputColorType === "number" ? options.inputColorType : constants.COLORTYPE_COLOR_ALPHA;
      if ([
        constants.COLORTYPE_GRAYSCALE,
        constants.COLORTYPE_COLOR,
        constants.COLORTYPE_COLOR_ALPHA,
        constants.COLORTYPE_ALPHA
      ].indexOf(options.colorType) === -1) {
        throw new Error(
          "option color type:" + options.colorType + " is not supported at present"
        );
      }
      if ([
        constants.COLORTYPE_GRAYSCALE,
        constants.COLORTYPE_COLOR,
        constants.COLORTYPE_COLOR_ALPHA,
        constants.COLORTYPE_ALPHA
      ].indexOf(options.inputColorType) === -1) {
        throw new Error(
          "option input color type:" + options.inputColorType + " is not supported at present"
        );
      }
      if (options.bitDepth !== 8 && options.bitDepth !== 16) {
        throw new Error(
          "option bit depth:" + options.bitDepth + " is not supported at present"
        );
      }
    };
    Packer.prototype.getDeflateOptions = function() {
      return {
        chunkSize: this._options.deflateChunkSize,
        level: this._options.deflateLevel,
        strategy: this._options.deflateStrategy
      };
    };
    Packer.prototype.createDeflate = function() {
      return this._options.deflateFactory(this.getDeflateOptions());
    };
    Packer.prototype.filterData = function(data, width, height) {
      let packedData = bitPacker(data, width, height, this._options);
      let bpp = constants.COLORTYPE_TO_BPP_MAP[this._options.colorType];
      let filteredData = filter(packedData, width, height, this._options, bpp);
      return filteredData;
    };
    Packer.prototype._packChunk = function(type, data) {
      let len = data ? data.length : 0;
      let buf = Buffer.alloc(len + 12);
      buf.writeUInt32BE(len, 0);
      buf.writeUInt32BE(type, 4);
      if (data) {
        data.copy(buf, 8);
      }
      buf.writeInt32BE(
        CrcStream.crc32(buf.slice(4, buf.length - 4)),
        buf.length - 4
      );
      return buf;
    };
    Packer.prototype.packGAMA = function(gamma) {
      let buf = Buffer.alloc(4);
      buf.writeUInt32BE(Math.floor(gamma * constants.GAMMA_DIVISION), 0);
      return this._packChunk(constants.TYPE_gAMA, buf);
    };
    Packer.prototype.packIHDR = function(width, height) {
      let buf = Buffer.alloc(13);
      buf.writeUInt32BE(width, 0);
      buf.writeUInt32BE(height, 4);
      buf[8] = this._options.bitDepth;
      buf[9] = this._options.colorType;
      buf[10] = 0;
      buf[11] = 0;
      buf[12] = 0;
      return this._packChunk(constants.TYPE_IHDR, buf);
    };
    Packer.prototype.packIDAT = function(data) {
      return this._packChunk(constants.TYPE_IDAT, data);
    };
    Packer.prototype.packIEND = function() {
      return this._packChunk(constants.TYPE_IEND, null);
    };
  }
});

// node_modules/pngjs/lib/packer-async.js
var require_packer_async = __commonJS({
  "node_modules/pngjs/lib/packer-async.js"(exports2, module2) {
    "use strict";
    var util = require("util");
    var Stream = require("stream");
    var constants = require_constants();
    var Packer = require_packer();
    var PackerAsync = module2.exports = function(opt) {
      Stream.call(this);
      let options = opt || {};
      this._packer = new Packer(options);
      this._deflate = this._packer.createDeflate();
      this.readable = true;
    };
    util.inherits(PackerAsync, Stream);
    PackerAsync.prototype.pack = function(data, width, height, gamma) {
      this.emit("data", Buffer.from(constants.PNG_SIGNATURE));
      this.emit("data", this._packer.packIHDR(width, height));
      if (gamma) {
        this.emit("data", this._packer.packGAMA(gamma));
      }
      let filteredData = this._packer.filterData(data, width, height);
      this._deflate.on("error", this.emit.bind(this, "error"));
      this._deflate.on(
        "data",
        function(compressedData) {
          this.emit("data", this._packer.packIDAT(compressedData));
        }.bind(this)
      );
      this._deflate.on(
        "end",
        function() {
          this.emit("data", this._packer.packIEND());
          this.emit("end");
        }.bind(this)
      );
      this._deflate.end(filteredData);
    };
  }
});

// node_modules/pngjs/lib/sync-inflate.js
var require_sync_inflate = __commonJS({
  "node_modules/pngjs/lib/sync-inflate.js"(exports2, module2) {
    "use strict";
    var assert = require("assert").ok;
    var zlib = require("zlib");
    var util = require("util");
    var kMaxLength = require("buffer").kMaxLength;
    function Inflate(opts) {
      if (!(this instanceof Inflate)) {
        return new Inflate(opts);
      }
      if (opts && opts.chunkSize < zlib.Z_MIN_CHUNK) {
        opts.chunkSize = zlib.Z_MIN_CHUNK;
      }
      zlib.Inflate.call(this, opts);
      this._offset = this._offset === void 0 ? this._outOffset : this._offset;
      this._buffer = this._buffer || this._outBuffer;
      if (opts && opts.maxLength != null) {
        this._maxLength = opts.maxLength;
      }
    }
    function createInflate(opts) {
      return new Inflate(opts);
    }
    function _close(engine, callback) {
      if (callback) {
        process.nextTick(callback);
      }
      if (!engine._handle) {
        return;
      }
      engine._handle.close();
      engine._handle = null;
    }
    Inflate.prototype._processChunk = function(chunk, flushFlag, asyncCb) {
      if (typeof asyncCb === "function") {
        return zlib.Inflate._processChunk.call(this, chunk, flushFlag, asyncCb);
      }
      let self = this;
      let availInBefore = chunk && chunk.length;
      let availOutBefore = this._chunkSize - this._offset;
      let leftToInflate = this._maxLength;
      let inOff = 0;
      let buffers = [];
      let nread = 0;
      let error;
      this.on("error", function(err) {
        error = err;
      });
      function handleChunk(availInAfter, availOutAfter) {
        if (self._hadError) {
          return;
        }
        let have = availOutBefore - availOutAfter;
        assert(have >= 0, "have should not go down");
        if (have > 0) {
          let out = self._buffer.slice(self._offset, self._offset + have);
          self._offset += have;
          if (out.length > leftToInflate) {
            out = out.slice(0, leftToInflate);
          }
          buffers.push(out);
          nread += out.length;
          leftToInflate -= out.length;
          if (leftToInflate === 0) {
            return false;
          }
        }
        if (availOutAfter === 0 || self._offset >= self._chunkSize) {
          availOutBefore = self._chunkSize;
          self._offset = 0;
          self._buffer = Buffer.allocUnsafe(self._chunkSize);
        }
        if (availOutAfter === 0) {
          inOff += availInBefore - availInAfter;
          availInBefore = availInAfter;
          return true;
        }
        return false;
      }
      assert(this._handle, "zlib binding closed");
      let res;
      do {
        res = this._handle.writeSync(
          flushFlag,
          chunk,
          // in
          inOff,
          // in_off
          availInBefore,
          // in_len
          this._buffer,
          // out
          this._offset,
          //out_off
          availOutBefore
        );
        res = res || this._writeState;
      } while (!this._hadError && handleChunk(res[0], res[1]));
      if (this._hadError) {
        throw error;
      }
      if (nread >= kMaxLength) {
        _close(this);
        throw new RangeError(
          "Cannot create final Buffer. It would be larger than 0x" + kMaxLength.toString(16) + " bytes"
        );
      }
      let buf = Buffer.concat(buffers, nread);
      _close(this);
      return buf;
    };
    util.inherits(Inflate, zlib.Inflate);
    function zlibBufferSync(engine, buffer) {
      if (typeof buffer === "string") {
        buffer = Buffer.from(buffer);
      }
      if (!(buffer instanceof Buffer)) {
        throw new TypeError("Not a string or buffer");
      }
      let flushFlag = engine._finishFlushFlag;
      if (flushFlag == null) {
        flushFlag = zlib.Z_FINISH;
      }
      return engine._processChunk(buffer, flushFlag);
    }
    function inflateSync(buffer, opts) {
      return zlibBufferSync(new Inflate(opts), buffer);
    }
    module2.exports = exports2 = inflateSync;
    exports2.Inflate = Inflate;
    exports2.createInflate = createInflate;
    exports2.inflateSync = inflateSync;
  }
});

// node_modules/pngjs/lib/sync-reader.js
var require_sync_reader = __commonJS({
  "node_modules/pngjs/lib/sync-reader.js"(exports2, module2) {
    "use strict";
    var SyncReader = module2.exports = function(buffer) {
      this._buffer = buffer;
      this._reads = [];
    };
    SyncReader.prototype.read = function(length, callback) {
      this._reads.push({
        length: Math.abs(length),
        // if length < 0 then at most this length
        allowLess: length < 0,
        func: callback
      });
    };
    SyncReader.prototype.process = function() {
      while (this._reads.length > 0 && this._buffer.length) {
        let read = this._reads[0];
        if (this._buffer.length && (this._buffer.length >= read.length || read.allowLess)) {
          this._reads.shift();
          let buf = this._buffer;
          this._buffer = buf.slice(read.length);
          read.func.call(this, buf.slice(0, read.length));
        } else {
          break;
        }
      }
      if (this._reads.length > 0) {
        throw new Error("There are some read requests waitng on finished stream");
      }
      if (this._buffer.length > 0) {
        throw new Error("unrecognised content at end of stream");
      }
    };
  }
});

// node_modules/pngjs/lib/filter-parse-sync.js
var require_filter_parse_sync = __commonJS({
  "node_modules/pngjs/lib/filter-parse-sync.js"(exports2) {
    "use strict";
    var SyncReader = require_sync_reader();
    var Filter = require_filter_parse();
    exports2.process = function(inBuffer, bitmapInfo) {
      let outBuffers = [];
      let reader = new SyncReader(inBuffer);
      let filter = new Filter(bitmapInfo, {
        read: reader.read.bind(reader),
        write: function(bufferPart) {
          outBuffers.push(bufferPart);
        },
        complete: function() {
        }
      });
      filter.start();
      reader.process();
      return Buffer.concat(outBuffers);
    };
  }
});

// node_modules/pngjs/lib/parser-sync.js
var require_parser_sync = __commonJS({
  "node_modules/pngjs/lib/parser-sync.js"(exports2, module2) {
    "use strict";
    var hasSyncZlib = true;
    var zlib = require("zlib");
    var inflateSync = require_sync_inflate();
    if (!zlib.deflateSync) {
      hasSyncZlib = false;
    }
    var SyncReader = require_sync_reader();
    var FilterSync = require_filter_parse_sync();
    var Parser = require_parser();
    var bitmapper = require_bitmapper();
    var formatNormaliser = require_format_normaliser();
    module2.exports = function(buffer, options) {
      if (!hasSyncZlib) {
        throw new Error(
          "To use the sync capability of this library in old node versions, please pin pngjs to v2.3.0"
        );
      }
      let err;
      function handleError(_err_) {
        err = _err_;
      }
      let metaData;
      function handleMetaData(_metaData_) {
        metaData = _metaData_;
      }
      function handleTransColor(transColor) {
        metaData.transColor = transColor;
      }
      function handlePalette(palette) {
        metaData.palette = palette;
      }
      function handleSimpleTransparency() {
        metaData.alpha = true;
      }
      let gamma;
      function handleGamma(_gamma_) {
        gamma = _gamma_;
      }
      let inflateDataList = [];
      function handleInflateData(inflatedData2) {
        inflateDataList.push(inflatedData2);
      }
      let reader = new SyncReader(buffer);
      let parser = new Parser(options, {
        read: reader.read.bind(reader),
        error: handleError,
        metadata: handleMetaData,
        gamma: handleGamma,
        palette: handlePalette,
        transColor: handleTransColor,
        inflateData: handleInflateData,
        simpleTransparency: handleSimpleTransparency
      });
      parser.start();
      reader.process();
      if (err) {
        throw err;
      }
      let inflateData = Buffer.concat(inflateDataList);
      inflateDataList.length = 0;
      let inflatedData;
      if (metaData.interlace) {
        inflatedData = zlib.inflateSync(inflateData);
      } else {
        let rowSize = (metaData.width * metaData.bpp * metaData.depth + 7 >> 3) + 1;
        let imageSize = rowSize * metaData.height;
        inflatedData = inflateSync(inflateData, {
          chunkSize: imageSize,
          maxLength: imageSize
        });
      }
      inflateData = null;
      if (!inflatedData || !inflatedData.length) {
        throw new Error("bad png - invalid inflate data response");
      }
      let unfilteredData = FilterSync.process(inflatedData, metaData);
      inflateData = null;
      let bitmapData = bitmapper.dataToBitMap(unfilteredData, metaData);
      unfilteredData = null;
      let normalisedBitmapData = formatNormaliser(
        bitmapData,
        metaData,
        options.skipRescale
      );
      metaData.data = normalisedBitmapData;
      metaData.gamma = gamma || 0;
      return metaData;
    };
  }
});

// node_modules/pngjs/lib/packer-sync.js
var require_packer_sync = __commonJS({
  "node_modules/pngjs/lib/packer-sync.js"(exports2, module2) {
    "use strict";
    var hasSyncZlib = true;
    var zlib = require("zlib");
    if (!zlib.deflateSync) {
      hasSyncZlib = false;
    }
    var constants = require_constants();
    var Packer = require_packer();
    module2.exports = function(metaData, opt) {
      if (!hasSyncZlib) {
        throw new Error(
          "To use the sync capability of this library in old node versions, please pin pngjs to v2.3.0"
        );
      }
      let options = opt || {};
      let packer = new Packer(options);
      let chunks = [];
      chunks.push(Buffer.from(constants.PNG_SIGNATURE));
      chunks.push(packer.packIHDR(metaData.width, metaData.height));
      if (metaData.gamma) {
        chunks.push(packer.packGAMA(metaData.gamma));
      }
      let filteredData = packer.filterData(
        metaData.data,
        metaData.width,
        metaData.height
      );
      let compressedData = zlib.deflateSync(
        filteredData,
        packer.getDeflateOptions()
      );
      filteredData = null;
      if (!compressedData || !compressedData.length) {
        throw new Error("bad png - invalid compressed data response");
      }
      chunks.push(packer.packIDAT(compressedData));
      chunks.push(packer.packIEND());
      return Buffer.concat(chunks);
    };
  }
});

// node_modules/pngjs/lib/png-sync.js
var require_png_sync = __commonJS({
  "node_modules/pngjs/lib/png-sync.js"(exports2) {
    "use strict";
    var parse = require_parser_sync();
    var pack = require_packer_sync();
    exports2.read = function(buffer, options) {
      return parse(buffer, options || {});
    };
    exports2.write = function(png, options) {
      return pack(png, options);
    };
  }
});

// node_modules/pngjs/lib/png.js
var require_png = __commonJS({
  "node_modules/pngjs/lib/png.js"(exports2) {
    "use strict";
    var util = require("util");
    var Stream = require("stream");
    var Parser = require_parser_async();
    var Packer = require_packer_async();
    var PNGSync = require_png_sync();
    var PNG = exports2.PNG = function(options) {
      Stream.call(this);
      options = options || {};
      this.width = options.width | 0;
      this.height = options.height | 0;
      this.data = this.width > 0 && this.height > 0 ? Buffer.alloc(4 * this.width * this.height) : null;
      if (options.fill && this.data) {
        this.data.fill(0);
      }
      this.gamma = 0;
      this.readable = this.writable = true;
      this._parser = new Parser(options);
      this._parser.on("error", this.emit.bind(this, "error"));
      this._parser.on("close", this._handleClose.bind(this));
      this._parser.on("metadata", this._metadata.bind(this));
      this._parser.on("gamma", this._gamma.bind(this));
      this._parser.on(
        "parsed",
        function(data) {
          this.data = data;
          this.emit("parsed", data);
        }.bind(this)
      );
      this._packer = new Packer(options);
      this._packer.on("data", this.emit.bind(this, "data"));
      this._packer.on("end", this.emit.bind(this, "end"));
      this._parser.on("close", this._handleClose.bind(this));
      this._packer.on("error", this.emit.bind(this, "error"));
    };
    util.inherits(PNG, Stream);
    PNG.sync = PNGSync;
    PNG.prototype.pack = function() {
      if (!this.data || !this.data.length) {
        this.emit("error", "No data provided");
        return this;
      }
      process.nextTick(
        function() {
          this._packer.pack(this.data, this.width, this.height, this.gamma);
        }.bind(this)
      );
      return this;
    };
    PNG.prototype.parse = function(data, callback) {
      if (callback) {
        let onParsed, onError;
        onParsed = function(parsedData) {
          this.removeListener("error", onError);
          this.data = parsedData;
          callback(null, this);
        }.bind(this);
        onError = function(err) {
          this.removeListener("parsed", onParsed);
          callback(err, null);
        }.bind(this);
        this.once("parsed", onParsed);
        this.once("error", onError);
      }
      this.end(data);
      return this;
    };
    PNG.prototype.write = function(data) {
      this._parser.write(data);
      return true;
    };
    PNG.prototype.end = function(data) {
      this._parser.end(data);
    };
    PNG.prototype._metadata = function(metadata) {
      this.width = metadata.width;
      this.height = metadata.height;
      this.emit("metadata", metadata);
    };
    PNG.prototype._gamma = function(gamma) {
      this.gamma = gamma;
    };
    PNG.prototype._handleClose = function() {
      if (!this._parser.writable && !this._packer.readable) {
        this.emit("close");
      }
    };
    PNG.bitblt = function(src, dst, srcX, srcY, width, height, deltaX, deltaY) {
      srcX |= 0;
      srcY |= 0;
      width |= 0;
      height |= 0;
      deltaX |= 0;
      deltaY |= 0;
      if (srcX > src.width || srcY > src.height || srcX + width > src.width || srcY + height > src.height) {
        throw new Error("bitblt reading outside image");
      }
      if (deltaX > dst.width || deltaY > dst.height || deltaX + width > dst.width || deltaY + height > dst.height) {
        throw new Error("bitblt writing outside image");
      }
      for (let y = 0; y < height; y++) {
        src.data.copy(
          dst.data,
          (deltaY + y) * dst.width + deltaX << 2,
          (srcY + y) * src.width + srcX << 2,
          (srcY + y) * src.width + srcX + width << 2
        );
      }
    };
    PNG.prototype.bitblt = function(dst, srcX, srcY, width, height, deltaX, deltaY) {
      PNG.bitblt(this, dst, srcX, srcY, width, height, deltaX, deltaY);
      return this;
    };
    PNG.adjustGamma = function(src) {
      if (src.gamma) {
        for (let y = 0; y < src.height; y++) {
          for (let x = 0; x < src.width; x++) {
            let idx = src.width * y + x << 2;
            for (let i = 0; i < 3; i++) {
              let sample = src.data[idx + i] / 255;
              sample = Math.pow(sample, 1 / 2.2 / src.gamma);
              src.data[idx + i] = Math.round(sample * 255);
            }
          }
        }
        src.gamma = 0;
      }
    };
    PNG.prototype.adjustGamma = function() {
      PNG.adjustGamma(this);
    };
  }
});

// node_modules/pixelmatch/index.js
var pixelmatch_exports = {};
__export(pixelmatch_exports, {
  default: () => pixelmatch
});
function pixelmatch(img1, img2, output, width, height, options = {}) {
  const {
    threshold = 0.1,
    alpha = 0.1,
    aaColor = [255, 255, 0],
    diffColor = [255, 0, 0],
    includeAA,
    diffColorAlt,
    diffMask
  } = options;
  if (!isPixelData(img1) || !isPixelData(img2) || output && !isPixelData(output))
    throw new Error("Image data: Uint8Array, Uint8ClampedArray or Buffer expected.");
  if (img1.length !== img2.length || output && output.length !== img1.length)
    throw new Error("Image sizes do not match.");
  if (img1.length !== width * height * 4) throw new Error("Image data size does not match width/height.");
  const len = width * height;
  const a32 = new Uint32Array(img1.buffer, img1.byteOffset, len);
  const b32 = new Uint32Array(img2.buffer, img2.byteOffset, len);
  let identical = true;
  for (let i = 0; i < len; i++) {
    if (a32[i] !== b32[i]) {
      identical = false;
      break;
    }
  }
  if (identical) {
    if (output && !diffMask) {
      for (let i = 0; i < len; i++) drawGrayPixel(img1, 4 * i, alpha, output);
    }
    return 0;
  }
  const maxDelta = 35215 * threshold * threshold;
  const [aaR, aaG, aaB] = aaColor;
  const [diffR, diffG, diffB] = diffColor;
  const [altR, altG, altB] = diffColorAlt || diffColor;
  let diff = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const pos = i * 4;
      const delta = a32[i] === b32[i] ? 0 : colorDelta(img1, img2, pos, pos, false);
      if (Math.abs(delta) > maxDelta) {
        const isAA = antialiased(img1, x, y, width, height, a32, b32) || antialiased(img2, x, y, width, height, b32, a32);
        if (!includeAA && isAA) {
          if (output && !diffMask) drawPixel(output, pos, aaR, aaG, aaB);
        } else {
          if (output) {
            if (delta < 0) {
              drawPixel(output, pos, altR, altG, altB);
            } else {
              drawPixel(output, pos, diffR, diffG, diffB);
            }
          }
          diff++;
        }
      } else if (output && !diffMask) {
        drawGrayPixel(img1, pos, alpha, output);
      }
    }
  }
  return diff;
}
function isPixelData(arr) {
  return ArrayBuffer.isView(arr) && arr.BYTES_PER_ELEMENT === 1;
}
function antialiased(img, x1, y1, width, height, a32, b32) {
  const x0 = Math.max(x1 - 1, 0);
  const y0 = Math.max(y1 - 1, 0);
  const x2 = Math.min(x1 + 1, width - 1);
  const y2 = Math.min(y1 + 1, height - 1);
  const pos = y1 * width + x1;
  let zeroes = x1 === x0 || x1 === x2 || y1 === y0 || y1 === y2 ? 1 : 0;
  let min = 0;
  let max = 0;
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  for (let x = x0; x <= x2; x++) {
    for (let y = y0; y <= y2; y++) {
      if (x === x1 && y === y1) continue;
      const delta = colorDelta(img, img, pos * 4, (y * width + x) * 4, true);
      if (delta === 0) {
        zeroes++;
        if (zeroes > 2) return false;
      } else if (delta < min) {
        min = delta;
        minX = x;
        minY = y;
      } else if (delta > max) {
        max = delta;
        maxX = x;
        maxY = y;
      }
    }
  }
  if (min === 0 || max === 0) return false;
  return hasManySiblings(a32, minX, minY, width, height) && hasManySiblings(b32, minX, minY, width, height) || hasManySiblings(a32, maxX, maxY, width, height) && hasManySiblings(b32, maxX, maxY, width, height);
}
function hasManySiblings(img, x1, y1, width, height) {
  const x0 = Math.max(x1 - 1, 0);
  const y0 = Math.max(y1 - 1, 0);
  const x2 = Math.min(x1 + 1, width - 1);
  const y2 = Math.min(y1 + 1, height - 1);
  const val = img[y1 * width + x1];
  let zeroes = x1 === x0 || x1 === x2 || y1 === y0 || y1 === y2 ? 1 : 0;
  for (let x = x0; x <= x2; x++) {
    for (let y = y0; y <= y2; y++) {
      if (x === x1 && y === y1) continue;
      zeroes += +(val === img[y * width + x]);
      if (zeroes > 2) return true;
    }
  }
  return false;
}
function colorDelta(img1, img2, k, m, yOnly) {
  const r1 = img1[k];
  const g1 = img1[k + 1];
  const b1 = img1[k + 2];
  const a1 = img1[k + 3];
  const r2 = img2[m];
  const g2 = img2[m + 1];
  const b2 = img2[m + 2];
  const a2 = img2[m + 3];
  let dr = r1 - r2;
  let dg = g1 - g2;
  let db2 = b1 - b2;
  const da = a1 - a2;
  if (!dr && !dg && !db2 && !da) return 0;
  if (a1 < 255 || a2 < 255) {
    const rb = 48 + 159 * (k % 2);
    const gb = 48 + 159 * ((k / 1.618033988749895 | 0) % 2);
    const bb = 48 + 159 * ((k / 2.618033988749895 | 0) % 2);
    dr = (r1 * a1 - r2 * a2 - rb * da) / 255;
    dg = (g1 * a1 - g2 * a2 - gb * da) / 255;
    db2 = (b1 * a1 - b2 * a2 - bb * da) / 255;
  }
  const y = dr * 0.29889531 + dg * 0.58662247 + db2 * 0.11448223;
  if (yOnly) return y;
  const i = dr * 0.59597799 - dg * 0.2741761 - db2 * 0.32180189;
  const q = dr * 0.21147017 - dg * 0.52261711 + db2 * 0.31114694;
  const delta = 0.5053 * y * y + 0.299 * i * i + 0.1957 * q * q;
  return y > 0 ? -delta : delta;
}
function drawPixel(output, pos, r, g, b) {
  output[pos + 0] = r;
  output[pos + 1] = g;
  output[pos + 2] = b;
  output[pos + 3] = 255;
}
function drawGrayPixel(img, i, alpha, output) {
  const val = 255 + (img[i] * 0.29889531 + img[i + 1] * 0.58662247 + img[i + 2] * 0.11448223 - 255) * alpha * img[i + 3] / 255;
  drawPixel(output, i, val, val, val);
}
var init_pixelmatch = __esm({
  "node_modules/pixelmatch/index.js"() {
  }
});

// node_modules/node-cron/dist/esm/create-id.js
var require_create_id = __commonJS({
  "node_modules/node-cron/dist/esm/create-id.js"(exports2) {
    "use strict";
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.createID = createID;
    var node_crypto_1 = __importDefault(require("node:crypto"));
    function createID(prefix = "", length = 16) {
      const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      const values = node_crypto_1.default.randomBytes(length);
      const id = Array.from(values, (v) => charset[v % charset.length]).join("");
      return prefix ? `${prefix}-${id}` : id;
    }
  }
});

// node_modules/node-cron/dist/esm/logger.js
var require_logger = __commonJS({
  "node_modules/node-cron/dist/esm/logger.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var levelColors = {
      INFO: "\x1B[36m",
      WARN: "\x1B[33m",
      ERROR: "\x1B[31m",
      DEBUG: "\x1B[35m"
    };
    var GREEN = "\x1B[32m";
    var RESET = "\x1B[0m";
    function log(level, message, extra) {
      const timestamp = (/* @__PURE__ */ new Date()).toISOString();
      const color = levelColors[level] ?? "";
      const prefix = `[${timestamp}] [PID: ${process.pid}] ${GREEN}[NODE-CRON]${GREEN} ${color}[${level}]${RESET}`;
      const output = `${prefix} ${message}`;
      switch (level) {
        case "ERROR":
          console.error(output, extra ?? "");
          break;
        case "DEBUG":
          console.debug(output, extra ?? "");
          break;
        case "WARN":
          console.warn(output);
          break;
        case "INFO":
        default:
          console.info(output);
          break;
      }
    }
    var logger = {
      info(message) {
        log("INFO", message);
      },
      warn(message) {
        log("WARN", message);
      },
      error(message, err) {
        if (message instanceof Error) {
          log("ERROR", message.message, message);
        } else {
          log("ERROR", message, err);
        }
      },
      debug(message, err) {
        if (message instanceof Error) {
          log("DEBUG", message.message, message);
        } else {
          log("DEBUG", message, err);
        }
      }
    };
    exports2.default = logger;
  }
});

// node_modules/node-cron/dist/esm/promise/tracked-promise.js
var require_tracked_promise = __commonJS({
  "node_modules/node-cron/dist/esm/promise/tracked-promise.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.TrackedPromise = void 0;
    var TrackedPromise = class {
      promise;
      error;
      state;
      value;
      constructor(executor) {
        this.state = "pending";
        this.promise = new Promise((resolve, reject) => {
          executor((value) => {
            this.state = "fulfilled";
            this.value = value;
            resolve(value);
          }, (error) => {
            this.state = "rejected";
            this.error = error;
            reject(error);
          });
        });
      }
      getPromise() {
        return this.promise;
      }
      getState() {
        return this.state;
      }
      isPending() {
        return this.state === "pending";
      }
      isFulfilled() {
        return this.state === "fulfilled";
      }
      isRejected() {
        return this.state === "rejected";
      }
      getValue() {
        return this.value;
      }
      getError() {
        return this.error;
      }
      then(onfulfilled, onrejected) {
        return this.promise.then(onfulfilled, onrejected);
      }
      catch(onrejected) {
        return this.promise.catch(onrejected);
      }
      finally(onfinally) {
        return this.promise.finally(onfinally);
      }
    };
    exports2.TrackedPromise = TrackedPromise;
  }
});

// node_modules/node-cron/dist/esm/scheduler/runner.js
var require_runner = __commonJS({
  "node_modules/node-cron/dist/esm/scheduler/runner.js"(exports2) {
    "use strict";
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Runner = void 0;
    var create_id_1 = require_create_id();
    var logger_1 = __importDefault(require_logger());
    var tracked_promise_1 = require_tracked_promise();
    function emptyOnFn() {
    }
    function emptyHookFn() {
      return true;
    }
    function defaultOnError(date, error) {
      logger_1.default.error("Task failed with error!", error);
    }
    var Runner = class {
      timeMatcher;
      onMatch;
      noOverlap;
      maxExecutions;
      maxRandomDelay;
      runCount;
      running;
      heartBeatTimeout;
      onMissedExecution;
      onOverlap;
      onError;
      beforeRun;
      onFinished;
      onMaxExecutions;
      constructor(timeMatcher, onMatch, options) {
        this.timeMatcher = timeMatcher;
        this.onMatch = onMatch;
        this.noOverlap = options == void 0 || options.noOverlap === void 0 ? false : options.noOverlap;
        this.maxExecutions = options?.maxExecutions;
        this.maxRandomDelay = options?.maxRandomDelay || 0;
        this.onMissedExecution = options?.onMissedExecution || emptyOnFn;
        this.onOverlap = options?.onOverlap || emptyOnFn;
        this.onError = options?.onError || defaultOnError;
        this.onFinished = options?.onFinished || emptyHookFn;
        this.beforeRun = options?.beforeRun || emptyHookFn;
        this.onMaxExecutions = options?.onMaxExecutions || emptyOnFn;
        this.runCount = 0;
        this.running = false;
      }
      start() {
        this.running = true;
        let lastExecution;
        let expectedNextExecution;
        const scheduleNextHeartBeat = (currentDate) => {
          if (this.running) {
            clearTimeout(this.heartBeatTimeout);
            this.heartBeatTimeout = setTimeout(heartBeat, getDelay(this.timeMatcher, currentDate));
          }
        };
        const runTask = (date) => {
          return new Promise(async (resolve) => {
            const execution = {
              id: (0, create_id_1.createID)("exec"),
              reason: "scheduled"
            };
            const shouldExecute = await this.beforeRun(date, execution);
            const randomDelay = Math.floor(Math.random() * this.maxRandomDelay);
            if (shouldExecute) {
              setTimeout(async () => {
                try {
                  this.runCount++;
                  execution.startedAt = /* @__PURE__ */ new Date();
                  const result = await this.onMatch(date, execution);
                  execution.finishedAt = /* @__PURE__ */ new Date();
                  execution.result = result;
                  this.onFinished(date, execution);
                  if (this.maxExecutions && this.runCount >= this.maxExecutions) {
                    this.onMaxExecutions(date);
                    this.stop();
                  }
                } catch (error) {
                  execution.finishedAt = /* @__PURE__ */ new Date();
                  execution.error = error;
                  this.onError(date, error, execution);
                }
                resolve(true);
              }, randomDelay);
            }
          });
        };
        const checkAndRun = (date) => {
          return new tracked_promise_1.TrackedPromise(async (resolve, reject) => {
            try {
              if (this.timeMatcher.match(date)) {
                await runTask(date);
              }
              resolve(true);
            } catch (err) {
              reject(err);
            }
          });
        };
        const heartBeat = async () => {
          const currentDate = nowWithoutMs();
          if (expectedNextExecution && expectedNextExecution.getTime() < currentDate.getTime()) {
            while (expectedNextExecution.getTime() < currentDate.getTime()) {
              logger_1.default.warn(`missed execution at ${expectedNextExecution}! Possible blocking IO or high CPU user at the same process used by node-cron.`);
              expectedNextExecution = this.timeMatcher.getNextMatch(expectedNextExecution);
              runAsync(this.onMissedExecution, expectedNextExecution, defaultOnError);
            }
          }
          if (lastExecution && lastExecution.getState() === "pending") {
            runAsync(this.onOverlap, currentDate, defaultOnError);
            if (this.noOverlap) {
              logger_1.default.warn("task still running, new execution blocked by overlap prevention!");
              expectedNextExecution = this.timeMatcher.getNextMatch(currentDate);
              scheduleNextHeartBeat(currentDate);
              return;
            }
          }
          lastExecution = checkAndRun(currentDate);
          expectedNextExecution = this.timeMatcher.getNextMatch(currentDate);
          scheduleNextHeartBeat(currentDate);
        };
        this.heartBeatTimeout = setTimeout(() => {
          heartBeat();
        }, getDelay(this.timeMatcher, nowWithoutMs()));
      }
      nextRun() {
        return this.timeMatcher.getNextMatch(/* @__PURE__ */ new Date());
      }
      stop() {
        this.running = false;
        if (this.heartBeatTimeout) {
          clearTimeout(this.heartBeatTimeout);
          this.heartBeatTimeout = void 0;
        }
      }
      isStarted() {
        return !!this.heartBeatTimeout && this.running;
      }
      isStopped() {
        return !this.isStarted();
      }
      async execute() {
        const date = /* @__PURE__ */ new Date();
        const execution = {
          id: (0, create_id_1.createID)("exec"),
          reason: "invoked"
        };
        try {
          const shouldExecute = await this.beforeRun(date, execution);
          if (shouldExecute) {
            this.runCount++;
            execution.startedAt = /* @__PURE__ */ new Date();
            const result = await this.onMatch(date, execution);
            execution.finishedAt = /* @__PURE__ */ new Date();
            execution.result = result;
            this.onFinished(date, execution);
          }
        } catch (error) {
          execution.finishedAt = /* @__PURE__ */ new Date();
          execution.error = error;
          this.onError(date, error, execution);
        }
      }
    };
    exports2.Runner = Runner;
    async function runAsync(fn, date, onError) {
      try {
        await fn(date);
      } catch (error) {
        onError(date, error);
      }
    }
    function getDelay(timeMatcher, currentDate) {
      const maxDelay = 864e5;
      const nextRun = timeMatcher.getNextMatch(currentDate);
      const now = /* @__PURE__ */ new Date();
      const delay = nextRun.getTime() - now.getTime();
      if (delay > maxDelay) {
        return maxDelay;
      }
      return Math.max(0, delay);
    }
    function nowWithoutMs() {
      const date = /* @__PURE__ */ new Date();
      date.setMilliseconds(0);
      return date;
    }
  }
});

// node_modules/node-cron/dist/esm/pattern/convertion/month-names-conversion.js
var require_month_names_conversion = __commonJS({
  "node_modules/node-cron/dist/esm/pattern/convertion/month-names-conversion.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.default = /* @__PURE__ */ (() => {
      const months = [
        "january",
        "february",
        "march",
        "april",
        "may",
        "june",
        "july",
        "august",
        "september",
        "october",
        "november",
        "december"
      ];
      const shortMonths = [
        "jan",
        "feb",
        "mar",
        "apr",
        "may",
        "jun",
        "jul",
        "aug",
        "sep",
        "oct",
        "nov",
        "dec"
      ];
      function convertMonthName(expression, items) {
        for (let i = 0; i < items.length; i++) {
          expression = expression.replace(new RegExp(items[i], "gi"), i + 1);
        }
        return expression;
      }
      function interprete(monthExpression) {
        monthExpression = convertMonthName(monthExpression, months);
        monthExpression = convertMonthName(monthExpression, shortMonths);
        return monthExpression;
      }
      return interprete;
    })();
  }
});

// node_modules/node-cron/dist/esm/pattern/convertion/week-day-names-conversion.js
var require_week_day_names_conversion = __commonJS({
  "node_modules/node-cron/dist/esm/pattern/convertion/week-day-names-conversion.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.default = /* @__PURE__ */ (() => {
      const weekDays = [
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday"
      ];
      const shortWeekDays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
      function convertWeekDayName(expression, items) {
        for (let i = 0; i < items.length; i++) {
          expression = expression.replace(new RegExp(items[i], "gi"), i);
        }
        return expression;
      }
      function convertWeekDays(expression) {
        expression = expression.replace("7", "0");
        expression = convertWeekDayName(expression, weekDays);
        return convertWeekDayName(expression, shortWeekDays);
      }
      return convertWeekDays;
    })();
  }
});

// node_modules/node-cron/dist/esm/pattern/convertion/asterisk-to-range-conversion.js
var require_asterisk_to_range_conversion = __commonJS({
  "node_modules/node-cron/dist/esm/pattern/convertion/asterisk-to-range-conversion.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.default = /* @__PURE__ */ (() => {
      function convertAsterisk(expression, replecement) {
        if (expression.indexOf("*") !== -1) {
          return expression.replace("*", replecement);
        }
        return expression;
      }
      function convertAsterisksToRanges(expressions) {
        expressions[0] = convertAsterisk(expressions[0], "0-59");
        expressions[1] = convertAsterisk(expressions[1], "0-59");
        expressions[2] = convertAsterisk(expressions[2], "0-23");
        expressions[3] = convertAsterisk(expressions[3], "1-31");
        expressions[4] = convertAsterisk(expressions[4], "1-12");
        expressions[5] = convertAsterisk(expressions[5], "0-6");
        return expressions;
      }
      return convertAsterisksToRanges;
    })();
  }
});

// node_modules/node-cron/dist/esm/pattern/convertion/range-conversion.js
var require_range_conversion = __commonJS({
  "node_modules/node-cron/dist/esm/pattern/convertion/range-conversion.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.default = /* @__PURE__ */ (() => {
      function replaceWithRange(expression, text, init, end, stepTxt) {
        const step = parseInt(stepTxt);
        const numbers = [];
        let last = parseInt(end);
        let first = parseInt(init);
        if (first > last) {
          last = parseInt(init);
          first = parseInt(end);
        }
        for (let i = first; i <= last; i += step) {
          numbers.push(i);
        }
        return expression.replace(new RegExp(text, "i"), numbers.join());
      }
      function convertRange(expression) {
        const rangeRegEx = /(\d+)-(\d+)(\/(\d+)|)/;
        let match = rangeRegEx.exec(expression);
        while (match !== null && match.length > 0) {
          expression = replaceWithRange(expression, match[0], match[1], match[2], match[4] || "1");
          match = rangeRegEx.exec(expression);
        }
        return expression;
      }
      function convertAllRanges(expressions) {
        for (let i = 0; i < expressions.length; i++) {
          expressions[i] = convertRange(expressions[i]);
        }
        return expressions;
      }
      return convertAllRanges;
    })();
  }
});

// node_modules/node-cron/dist/esm/pattern/convertion/index.js
var require_convertion = __commonJS({
  "node_modules/node-cron/dist/esm/pattern/convertion/index.js"(exports2) {
    "use strict";
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    var month_names_conversion_1 = __importDefault(require_month_names_conversion());
    var week_day_names_conversion_1 = __importDefault(require_week_day_names_conversion());
    var asterisk_to_range_conversion_1 = __importDefault(require_asterisk_to_range_conversion());
    var range_conversion_1 = __importDefault(require_range_conversion());
    exports2.default = /* @__PURE__ */ (() => {
      function appendSeccondExpression(expressions) {
        if (expressions.length === 5) {
          return ["0"].concat(expressions);
        }
        return expressions;
      }
      function removeSpaces(str) {
        return str.replace(/\s{2,}/g, " ").trim();
      }
      function normalizeIntegers(expressions) {
        for (let i = 0; i < expressions.length; i++) {
          const numbers = expressions[i].split(",");
          for (let j = 0; j < numbers.length; j++) {
            numbers[j] = parseInt(numbers[j]);
          }
          expressions[i] = numbers;
        }
        return expressions;
      }
      function interprete(expression) {
        let expressions = removeSpaces(`${expression}`).split(" ");
        expressions = appendSeccondExpression(expressions);
        expressions[4] = (0, month_names_conversion_1.default)(expressions[4]);
        expressions[5] = (0, week_day_names_conversion_1.default)(expressions[5]);
        expressions = (0, asterisk_to_range_conversion_1.default)(expressions);
        expressions = (0, range_conversion_1.default)(expressions);
        expressions = normalizeIntegers(expressions);
        return expressions;
      }
      return interprete;
    })();
  }
});

// node_modules/node-cron/dist/esm/time/localized-time.js
var require_localized_time = __commonJS({
  "node_modules/node-cron/dist/esm/time/localized-time.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.LocalizedTime = void 0;
    var LocalizedTime = class {
      timestamp;
      parts;
      timezone;
      constructor(date, timezone) {
        this.timestamp = date.getTime();
        this.timezone = timezone;
        this.parts = buildDateParts(date, timezone);
      }
      toDate() {
        return new Date(this.timestamp);
      }
      toISO() {
        const gmt = this.parts.gmt.replace(/^GMT/, "");
        const offset = gmt ? gmt : "Z";
        const pad = (n) => String(n).padStart(2, "0");
        return `${this.parts.year}-${pad(this.parts.month)}-${pad(this.parts.day)}T${pad(this.parts.hour)}:${pad(this.parts.minute)}:${pad(this.parts.second)}.${String(this.parts.milisecond).padStart(3, "0")}` + offset;
      }
      getParts() {
        return this.parts;
      }
      set(field, value) {
        this.parts[field] = value;
        const newDate = new Date(this.toISO());
        this.timestamp = newDate.getTime();
        this.parts = buildDateParts(newDate, this.timezone);
      }
    };
    exports2.LocalizedTime = LocalizedTime;
    function buildDateParts(date, timezone) {
      const dftOptions = {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        weekday: "short",
        hour12: false
      };
      if (timezone) {
        dftOptions.timeZone = timezone;
      }
      const dateFormat = new Intl.DateTimeFormat("en-US", dftOptions);
      const parts = dateFormat.formatToParts(date).filter((part) => {
        return part.type !== "literal";
      }).reduce((acc, part) => {
        acc[part.type] = part.value;
        return acc;
      }, {});
      return {
        day: parseInt(parts.day),
        month: parseInt(parts.month),
        year: parseInt(parts.year),
        hour: parts.hour === "24" ? 0 : parseInt(parts.hour),
        minute: parseInt(parts.minute),
        second: parseInt(parts.second),
        milisecond: date.getMilliseconds(),
        weekday: parts.weekday,
        gmt: getTimezoneGMT(date, timezone)
      };
    }
    function getTimezoneGMT(date, timezone) {
      const utcDate = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
      const tzDate = new Date(date.toLocaleString("en-US", { timeZone: timezone }));
      let offsetInMinutes = (utcDate.getTime() - tzDate.getTime()) / 6e4;
      const sign = offsetInMinutes <= 0 ? "+" : "-";
      offsetInMinutes = Math.abs(offsetInMinutes);
      if (offsetInMinutes === 0)
        return "Z";
      const hours = Math.floor(offsetInMinutes / 60).toString().padStart(2, "0");
      const minutes = Math.floor(offsetInMinutes % 60).toString().padStart(2, "0");
      return `GMT${sign}${hours}:${minutes}`;
    }
  }
});

// node_modules/node-cron/dist/esm/time/matcher-walker.js
var require_matcher_walker = __commonJS({
  "node_modules/node-cron/dist/esm/time/matcher-walker.js"(exports2) {
    "use strict";
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.MatcherWalker = void 0;
    var convertion_1 = __importDefault(require_convertion());
    var localized_time_1 = require_localized_time();
    var time_matcher_1 = require_time_matcher();
    var week_day_names_conversion_1 = __importDefault(require_week_day_names_conversion());
    var MatcherWalker = class {
      cronExpression;
      baseDate;
      pattern;
      expressions;
      timeMatcher;
      timezone;
      constructor(cronExpression, baseDate, timezone) {
        this.cronExpression = cronExpression;
        this.baseDate = baseDate;
        this.timeMatcher = new time_matcher_1.TimeMatcher(cronExpression, timezone);
        this.timezone = timezone;
        this.expressions = (0, convertion_1.default)(cronExpression);
      }
      isMatching() {
        return this.timeMatcher.match(this.baseDate);
      }
      matchNext() {
        const findNextDateIgnoringWeekday = () => {
          const baseDate = new Date(this.baseDate.getTime());
          baseDate.setMilliseconds(0);
          const localTime = new localized_time_1.LocalizedTime(baseDate, this.timezone);
          const dateParts = localTime.getParts();
          const date2 = new localized_time_1.LocalizedTime(localTime.toDate(), this.timezone);
          const seconds = this.expressions[0];
          const nextSecond = availableValue(seconds, dateParts.second);
          if (nextSecond) {
            date2.set("second", nextSecond);
            if (this.timeMatcher.match(date2.toDate())) {
              return date2;
            }
          }
          date2.set("second", seconds[0]);
          const minutes = this.expressions[1];
          const nextMinute = availableValue(minutes, dateParts.minute);
          if (nextMinute) {
            date2.set("minute", nextMinute);
            if (this.timeMatcher.match(date2.toDate())) {
              return date2;
            }
          }
          date2.set("minute", minutes[0]);
          const hours = this.expressions[2];
          const nextHour = availableValue(hours, dateParts.hour);
          if (nextHour) {
            date2.set("hour", nextHour);
            if (this.timeMatcher.match(date2.toDate())) {
              return date2;
            }
          }
          date2.set("hour", hours[0]);
          const days = this.expressions[3];
          const nextDay = availableValue(days, dateParts.day);
          if (nextDay) {
            date2.set("day", nextDay);
            if (this.timeMatcher.match(date2.toDate())) {
              return date2;
            }
          }
          date2.set("day", days[0]);
          const months = this.expressions[4];
          const nextMonth = availableValue(months, dateParts.month);
          if (nextMonth) {
            date2.set("month", nextMonth);
            if (this.timeMatcher.match(date2.toDate())) {
              return date2;
            }
          }
          date2.set("year", date2.getParts().year + 1);
          date2.set("month", months[0]);
          return date2;
        };
        const date = findNextDateIgnoringWeekday();
        const weekdays = this.expressions[5];
        let currentWeekday = parseInt((0, week_day_names_conversion_1.default)(date.getParts().weekday));
        while (!(weekdays.indexOf(currentWeekday) > -1)) {
          date.set("year", date.getParts().year + 1);
          currentWeekday = parseInt((0, week_day_names_conversion_1.default)(date.getParts().weekday));
        }
        return date;
      }
    };
    exports2.MatcherWalker = MatcherWalker;
    function availableValue(values, currentValue) {
      const availableValues = values.sort((a, b) => a - b).filter((s) => s > currentValue);
      if (availableValues.length > 0)
        return availableValues[0];
      return false;
    }
  }
});

// node_modules/node-cron/dist/esm/time/time-matcher.js
var require_time_matcher = __commonJS({
  "node_modules/node-cron/dist/esm/time/time-matcher.js"(exports2) {
    "use strict";
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.TimeMatcher = void 0;
    var index_1 = __importDefault(require_convertion());
    var week_day_names_conversion_1 = __importDefault(require_week_day_names_conversion());
    var localized_time_1 = require_localized_time();
    var matcher_walker_1 = require_matcher_walker();
    function matchValue(allowedValues, value) {
      return allowedValues.indexOf(value) !== -1;
    }
    var TimeMatcher = class {
      timezone;
      pattern;
      expressions;
      constructor(pattern, timezone) {
        this.timezone = timezone;
        this.pattern = pattern;
        this.expressions = (0, index_1.default)(pattern);
      }
      match(date) {
        const localizedTime = new localized_time_1.LocalizedTime(date, this.timezone);
        const parts = localizedTime.getParts();
        const runOnSecond = matchValue(this.expressions[0], parts.second);
        const runOnMinute = matchValue(this.expressions[1], parts.minute);
        const runOnHour = matchValue(this.expressions[2], parts.hour);
        const runOnDay = matchValue(this.expressions[3], parts.day);
        const runOnMonth = matchValue(this.expressions[4], parts.month);
        const runOnWeekDay = matchValue(this.expressions[5], parseInt((0, week_day_names_conversion_1.default)(parts.weekday)));
        return runOnSecond && runOnMinute && runOnHour && runOnDay && runOnMonth && runOnWeekDay;
      }
      getNextMatch(date) {
        const walker = new matcher_walker_1.MatcherWalker(this.pattern, date, this.timezone);
        const next = walker.matchNext();
        return next.toDate();
      }
    };
    exports2.TimeMatcher = TimeMatcher;
  }
});

// node_modules/node-cron/dist/esm/tasks/state-machine.js
var require_state_machine = __commonJS({
  "node_modules/node-cron/dist/esm/tasks/state-machine.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.StateMachine = void 0;
    var allowedTransitions = {
      "stopped": ["stopped", "idle", "destroyed"],
      "idle": ["idle", "running", "stopped", "destroyed"],
      "running": ["running", "idle", "stopped", "destroyed"],
      "destroyed": ["destroyed"]
    };
    var StateMachine = class {
      state;
      constructor(initial = "stopped") {
        this.state = initial;
      }
      changeState(state) {
        if (allowedTransitions[this.state].includes(state)) {
          this.state = state;
        } else {
          throw new Error(`invalid transition from ${this.state} to ${state}`);
        }
      }
    };
    exports2.StateMachine = StateMachine;
  }
});

// node_modules/node-cron/dist/esm/tasks/inline-scheduled-task.js
var require_inline_scheduled_task = __commonJS({
  "node_modules/node-cron/dist/esm/tasks/inline-scheduled-task.js"(exports2) {
    "use strict";
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.InlineScheduledTask = void 0;
    var events_1 = __importDefault(require("events"));
    var runner_1 = require_runner();
    var time_matcher_1 = require_time_matcher();
    var create_id_1 = require_create_id();
    var state_machine_1 = require_state_machine();
    var logger_1 = __importDefault(require_logger());
    var localized_time_1 = require_localized_time();
    var TaskEmitter = class extends events_1.default {
    };
    var InlineScheduledTask = class {
      emitter;
      cronExpression;
      timeMatcher;
      runner;
      id;
      name;
      stateMachine;
      timezone;
      constructor(cronExpression, taskFn, options) {
        this.emitter = new TaskEmitter();
        this.cronExpression = cronExpression;
        this.id = (0, create_id_1.createID)("task", 12);
        this.name = options?.name || this.id;
        this.timezone = options?.timezone;
        this.timeMatcher = new time_matcher_1.TimeMatcher(cronExpression, options?.timezone);
        this.stateMachine = new state_machine_1.StateMachine();
        const runnerOptions = {
          timezone: options?.timezone,
          noOverlap: options?.noOverlap,
          maxExecutions: options?.maxExecutions,
          maxRandomDelay: options?.maxRandomDelay,
          beforeRun: (date, execution) => {
            if (execution.reason === "scheduled") {
              this.changeState("running");
            }
            this.emitter.emit("execution:started", this.createContext(date, execution));
            return true;
          },
          onFinished: (date, execution) => {
            if (execution.reason === "scheduled") {
              this.changeState("idle");
            }
            this.emitter.emit("execution:finished", this.createContext(date, execution));
            return true;
          },
          onError: (date, error, execution) => {
            logger_1.default.error(error);
            this.emitter.emit("execution:failed", this.createContext(date, execution));
            this.changeState("idle");
          },
          onOverlap: (date) => {
            this.emitter.emit("execution:overlap", this.createContext(date));
          },
          onMissedExecution: (date) => {
            this.emitter.emit("execution:missed", this.createContext(date));
          },
          onMaxExecutions: (date) => {
            this.emitter.emit("execution:maxReached", this.createContext(date));
            this.destroy();
          }
        };
        this.runner = new runner_1.Runner(this.timeMatcher, (date, execution) => {
          return taskFn(this.createContext(date, execution));
        }, runnerOptions);
      }
      getNextRun() {
        if (this.stateMachine.state !== "stopped") {
          return this.runner.nextRun();
        }
        return null;
      }
      changeState(state) {
        if (this.runner.isStarted()) {
          this.stateMachine.changeState(state);
        }
      }
      start() {
        if (this.runner.isStopped()) {
          this.runner.start();
          this.stateMachine.changeState("idle");
          this.emitter.emit("task:started", this.createContext(/* @__PURE__ */ new Date()));
        }
      }
      stop() {
        if (this.runner.isStarted()) {
          this.runner.stop();
          this.stateMachine.changeState("stopped");
          this.emitter.emit("task:stopped", this.createContext(/* @__PURE__ */ new Date()));
        }
      }
      getStatus() {
        return this.stateMachine.state;
      }
      destroy() {
        if (this.stateMachine.state === "destroyed")
          return;
        this.stop();
        this.stateMachine.changeState("destroyed");
        this.emitter.emit("task:destroyed", this.createContext(/* @__PURE__ */ new Date()));
      }
      execute() {
        return new Promise((resolve, reject) => {
          const onFail = (context) => {
            this.off("execution:finished", onFail);
            reject(context.execution?.error);
          };
          const onFinished = (context) => {
            this.off("execution:failed", onFail);
            resolve(context.execution?.result);
          };
          this.once("execution:finished", onFinished);
          this.once("execution:failed", onFail);
          this.runner.execute();
        });
      }
      on(event, fun) {
        this.emitter.on(event, fun);
      }
      off(event, fun) {
        this.emitter.off(event, fun);
      }
      once(event, fun) {
        this.emitter.once(event, fun);
      }
      createContext(executionDate, execution) {
        const localTime = new localized_time_1.LocalizedTime(executionDate, this.timezone);
        const ctx = {
          date: localTime.toDate(),
          dateLocalIso: localTime.toISO(),
          triggeredAt: /* @__PURE__ */ new Date(),
          task: this,
          execution
        };
        return ctx;
      }
    };
    exports2.InlineScheduledTask = InlineScheduledTask;
  }
});

// node_modules/node-cron/dist/esm/task-registry.js
var require_task_registry = __commonJS({
  "node_modules/node-cron/dist/esm/task-registry.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.TaskRegistry = void 0;
    var tasks = /* @__PURE__ */ new Map();
    var TaskRegistry = class {
      add(task) {
        if (this.has(task.id)) {
          throw Error(`task ${task.id} already registred!`);
        }
        tasks.set(task.id, task);
        task.on("task:destroyed", () => {
          this.remove(task);
        });
      }
      get(taskId) {
        return tasks.get(taskId);
      }
      remove(task) {
        if (this.has(task.id)) {
          task?.destroy();
          tasks.delete(task.id);
        }
      }
      all() {
        return tasks;
      }
      has(taskId) {
        return tasks.has(taskId);
      }
      killAll() {
        tasks.forEach((id) => this.remove(id));
      }
    };
    exports2.TaskRegistry = TaskRegistry;
  }
});

// node_modules/node-cron/dist/esm/pattern/validation/pattern-validation.js
var require_pattern_validation = __commonJS({
  "node_modules/node-cron/dist/esm/pattern/validation/pattern-validation.js"(exports2) {
    "use strict";
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    var index_1 = __importDefault(require_convertion());
    var validationRegex = /^(?:\d+|\*|\*\/\d+)$/;
    function isValidExpression(expression, min, max) {
      const options = expression;
      for (const option of options) {
        const optionAsInt = parseInt(option, 10);
        if (!Number.isNaN(optionAsInt) && (optionAsInt < min || optionAsInt > max) || !validationRegex.test(option))
          return false;
      }
      return true;
    }
    function isInvalidSecond(expression) {
      return !isValidExpression(expression, 0, 59);
    }
    function isInvalidMinute(expression) {
      return !isValidExpression(expression, 0, 59);
    }
    function isInvalidHour(expression) {
      return !isValidExpression(expression, 0, 23);
    }
    function isInvalidDayOfMonth(expression) {
      return !isValidExpression(expression, 1, 31);
    }
    function isInvalidMonth(expression) {
      return !isValidExpression(expression, 1, 12);
    }
    function isInvalidWeekDay(expression) {
      return !isValidExpression(expression, 0, 7);
    }
    function validateFields(patterns, executablePatterns) {
      if (isInvalidSecond(executablePatterns[0]))
        throw new Error(`${patterns[0]} is a invalid expression for second`);
      if (isInvalidMinute(executablePatterns[1]))
        throw new Error(`${patterns[1]} is a invalid expression for minute`);
      if (isInvalidHour(executablePatterns[2]))
        throw new Error(`${patterns[2]} is a invalid expression for hour`);
      if (isInvalidDayOfMonth(executablePatterns[3]))
        throw new Error(`${patterns[3]} is a invalid expression for day of month`);
      if (isInvalidMonth(executablePatterns[4]))
        throw new Error(`${patterns[4]} is a invalid expression for month`);
      if (isInvalidWeekDay(executablePatterns[5]))
        throw new Error(`${patterns[5]} is a invalid expression for week day`);
    }
    function validate(pattern) {
      if (typeof pattern !== "string")
        throw new TypeError("pattern must be a string!");
      const patterns = pattern.split(" ");
      const executablePatterns = (0, index_1.default)(pattern);
      if (patterns.length === 5)
        patterns.unshift("0");
      validateFields(patterns, executablePatterns);
    }
    exports2.default = validate;
  }
});

// node_modules/node-cron/dist/esm/tasks/background-scheduled-task/background-scheduled-task.js
var require_background_scheduled_task = __commonJS({
  "node_modules/node-cron/dist/esm/tasks/background-scheduled-task/background-scheduled-task.js"(exports2) {
    "use strict";
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    var path_1 = require("path");
    var child_process_1 = require("child_process");
    var create_id_1 = require_create_id();
    var stream_1 = require("stream");
    var state_machine_1 = require_state_machine();
    var localized_time_1 = require_localized_time();
    var logger_1 = __importDefault(require_logger());
    var time_matcher_1 = require_time_matcher();
    var daemonPath = (0, path_1.resolve)(__dirname, "daemon.js");
    var TaskEmitter = class extends stream_1.EventEmitter {
    };
    var BackgroundScheduledTask = class {
      emitter;
      id;
      name;
      cronExpression;
      taskPath;
      options;
      forkProcess;
      stateMachine;
      constructor(cronExpression, taskPath, options) {
        this.cronExpression = cronExpression;
        this.taskPath = taskPath;
        this.options = options;
        this.id = (0, create_id_1.createID)("task");
        this.name = options?.name || this.id;
        this.emitter = new TaskEmitter();
        this.stateMachine = new state_machine_1.StateMachine("stopped");
        this.on("task:stopped", () => {
          this.forkProcess?.kill();
          this.forkProcess = void 0;
          this.stateMachine.changeState("stopped");
        });
        this.on("task:destroyed", () => {
          this.forkProcess?.kill();
          this.forkProcess = void 0;
          this.stateMachine.changeState("destroyed");
        });
      }
      getNextRun() {
        if (this.stateMachine.state !== "stopped") {
          const timeMatcher = new time_matcher_1.TimeMatcher(this.cronExpression, this.options?.timezone);
          return timeMatcher.getNextMatch(/* @__PURE__ */ new Date());
        }
        return null;
      }
      start() {
        return new Promise((resolve, reject) => {
          if (this.forkProcess) {
            return resolve(void 0);
          }
          const timeout = setTimeout(() => {
            reject(new Error("Start operation timed out"));
          }, 5e3);
          try {
            this.forkProcess = (0, child_process_1.fork)(daemonPath);
            this.forkProcess.on("error", (err) => {
              clearTimeout(timeout);
              reject(new Error(`Error on daemon: ${err.message}`));
            });
            this.forkProcess.on("exit", (code, signal) => {
              if (code !== 0 && signal !== "SIGTERM") {
                const erro = new Error(`node-cron daemon exited with code ${code || signal}`);
                logger_1.default.error(erro);
                clearTimeout(timeout);
                reject(erro);
              }
            });
            this.forkProcess.on("message", (message) => {
              if (message.jsonError) {
                if (message.context?.execution) {
                  message.context.execution.error = deserializeError(message.jsonError);
                  delete message.jsonError;
                }
              }
              if (message.context?.task?.state) {
                this.stateMachine.changeState(message.context?.task?.state);
              }
              if (message.context) {
                const execution = message.context?.execution;
                delete execution?.hasError;
                const context = this.createContext(new Date(message.context.date), execution);
                this.emitter.emit(message.event, context);
              }
            });
            this.once("task:started", () => {
              this.stateMachine.changeState("idle");
              clearTimeout(timeout);
              resolve(void 0);
            });
            this.forkProcess.send({
              command: "task:start",
              path: this.taskPath,
              cron: this.cronExpression,
              options: this.options
            });
          } catch (error) {
            reject(error);
          }
        });
      }
      stop() {
        return new Promise((resolve, reject) => {
          if (!this.forkProcess) {
            return resolve(void 0);
          }
          const timeoutId = setTimeout(() => {
            clearTimeout(timeoutId);
            reject(new Error("Stop operation timed out"));
          }, 5e3);
          const cleanupAndResolve = () => {
            clearTimeout(timeoutId);
            this.off("task:stopped", onStopped);
            this.forkProcess = void 0;
            resolve(void 0);
          };
          const onStopped = () => {
            cleanupAndResolve();
          };
          this.once("task:stopped", onStopped);
          this.forkProcess.send({
            command: "task:stop"
          });
        });
      }
      getStatus() {
        return this.stateMachine.state;
      }
      destroy() {
        return new Promise((resolve, reject) => {
          if (!this.forkProcess) {
            return resolve(void 0);
          }
          const timeoutId = setTimeout(() => {
            clearTimeout(timeoutId);
            reject(new Error("Destroy operation timed out"));
          }, 5e3);
          const onDestroy = () => {
            clearTimeout(timeoutId);
            this.off("task:destroyed", onDestroy);
            resolve(void 0);
          };
          this.once("task:destroyed", onDestroy);
          this.forkProcess.send({
            command: "task:destroy"
          });
        });
      }
      execute() {
        return new Promise((resolve, reject) => {
          if (!this.forkProcess) {
            return reject(new Error("Cannot execute background task because it hasn't been started yet. Please initialize the task using the start() method before attempting to execute it."));
          }
          const timeoutId = setTimeout(() => {
            cleanupListeners();
            reject(new Error("Execution timeout exceeded"));
          }, 5e3);
          const cleanupListeners = () => {
            clearTimeout(timeoutId);
            this.off("execution:finished", onFinished);
            this.off("execution:failed", onFail);
          };
          const onFinished = (context) => {
            cleanupListeners();
            resolve(context.execution?.result);
          };
          const onFail = (context) => {
            cleanupListeners();
            reject(context.execution?.error || new Error("Execution failed without specific error"));
          };
          this.once("execution:finished", onFinished);
          this.once("execution:failed", onFail);
          this.forkProcess.send({
            command: "task:execute"
          });
        });
      }
      on(event, fun) {
        this.emitter.on(event, fun);
      }
      off(event, fun) {
        this.emitter.off(event, fun);
      }
      once(event, fun) {
        this.emitter.once(event, fun);
      }
      createContext(executionDate, execution) {
        const localTime = new localized_time_1.LocalizedTime(executionDate, this.options?.timezone);
        const ctx = {
          date: localTime.toDate(),
          dateLocalIso: localTime.toISO(),
          triggeredAt: /* @__PURE__ */ new Date(),
          task: this,
          execution
        };
        return ctx;
      }
    };
    function deserializeError(str) {
      const data = JSON.parse(str);
      const Err = globalThis[data.name] || Error;
      const err = new Err(data.message);
      if (data.stack) {
        err.stack = data.stack;
      }
      Object.keys(data).forEach((key) => {
        if (!["name", "message", "stack"].includes(key)) {
          err[key] = data[key];
        }
      });
      return err;
    }
    exports2.default = BackgroundScheduledTask;
  }
});

// node_modules/node-cron/dist/esm/node-cron.js
var require_node_cron = __commonJS({
  "node_modules/node-cron/dist/esm/node-cron.js"(exports2) {
    "use strict";
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.nodeCron = exports2.getTask = exports2.getTasks = void 0;
    exports2.schedule = schedule;
    exports2.createTask = createTask;
    exports2.solvePath = solvePath;
    exports2.validate = validate;
    var inline_scheduled_task_1 = require_inline_scheduled_task();
    var task_registry_1 = require_task_registry();
    var pattern_validation_1 = __importDefault(require_pattern_validation());
    var background_scheduled_task_1 = __importDefault(require_background_scheduled_task());
    var path_1 = __importDefault(require("path"));
    var url_1 = require("url");
    var registry = new task_registry_1.TaskRegistry();
    function schedule(expression, func, options) {
      const task = createTask(expression, func, options);
      task.start();
      return task;
    }
    function createTask(expression, func, options) {
      let task;
      if (func instanceof Function) {
        task = new inline_scheduled_task_1.InlineScheduledTask(expression, func, options);
      } else {
        const taskPath = solvePath(func);
        task = new background_scheduled_task_1.default(expression, taskPath, options);
      }
      registry.add(task);
      return task;
    }
    function solvePath(filePath) {
      if (path_1.default.isAbsolute(filePath))
        return (0, url_1.pathToFileURL)(filePath).href;
      if (filePath.startsWith("file://"))
        return filePath;
      const stackLines = new Error().stack?.split("\n");
      if (stackLines) {
        stackLines?.shift();
        const callerLine = stackLines?.find((line) => {
          return line.indexOf(__filename) === -1;
        });
        const match = callerLine?.match(/(file:\/\/)?(((\/?)(\w:))?([/\\].+)):\d+:\d+/);
        if (match) {
          const dir = `${match[5] ?? ""}${path_1.default.dirname(match[6])}`;
          return (0, url_1.pathToFileURL)(path_1.default.resolve(dir, filePath)).href;
        }
      }
      throw new Error(`Could not locate task file ${filePath}`);
    }
    function validate(expression) {
      try {
        (0, pattern_validation_1.default)(expression);
        return true;
      } catch (e) {
        return false;
      }
    }
    exports2.getTasks = registry.all;
    exports2.getTask = registry.get;
    exports2.nodeCron = {
      schedule,
      createTask,
      validate,
      getTasks: exports2.getTasks,
      getTask: exports2.getTask
    };
    exports2.default = exports2.nodeCron;
  }
});

// flowmind.ts
var import_playwright = require("playwright");
var import_chalk = __toESM(require("chalk"));
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var readline = __toESM(require("readline"));
var import_better_sqlite3 = __toESM(require("better-sqlite3"));
var import_uuid = require("uuid");
var HOME_DIR = process.env.HOME || process.env.USERPROFILE || ".";
var DATA_PATH = path.join(HOME_DIR, ".flowmind");
var DB_PATH = path.join(DATA_PATH, "data", "flowmind.db");
var DatabaseManager = class {
  db;
  constructor() {
    fs.mkdirSync(path.join(DATA_PATH, "data"), { recursive: true });
    fs.mkdirSync(path.join(DATA_PATH, "screenshots"), { recursive: true });
    this.db = new import_better_sqlite3.default(DB_PATH);
    this.initialize();
  }
  initialize() {
    this.db.pragma("foreign_keys = ON");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS flows (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, app_url TEXT,
        graph TEXT NOT NULL DEFAULT '{}', version TEXT NOT NULL DEFAULT '1.0.0',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY, flow_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT, duration INTEGER, error_message TEXT, summary TEXT,
        FOREIGN KEY (flow_id) REFERENCES flows(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS steps (
        id TEXT PRIMARY KEY, run_id TEXT NOT NULL, step_number INTEGER NOT NULL,
        name TEXT NOT NULL, action TEXT NOT NULL, selector TEXT, value TEXT,
        status TEXT NOT NULL DEFAULT 'pending', duration INTEGER,
        error_message TEXT, screenshot_path TEXT,
        FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS schedules (
        id TEXT PRIMARY KEY, flow_id TEXT NOT NULL, name TEXT NOT NULL,
        cron_expression TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
        last_run_at TEXT, last_run_status TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (flow_id) REFERENCES flows(id) ON DELETE CASCADE
      );
    `);
  }
  // ---- Flows ----
  createFlow(data) {
    const id = (0, import_uuid.v4)();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    this.db.prepare(`INSERT INTO flows (id, name, description, app_url, graph, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, data.name, data.description || null, data.appUrl || null, JSON.stringify(data.graph || {}), now, now);
    return this.getFlow(id);
  }
  getFlow(id) {
    const r = this.db.prepare("SELECT * FROM flows WHERE id = ?").get(id);
    return r ? this.mapFlow(r) : null;
  }
  findFlowByPartialId(q) {
    const rows = this.db.prepare("SELECT * FROM flows WHERE id LIKE ?").all(q + "%");
    return rows.length === 1 ? this.mapFlow(rows[0]) : null;
  }
  findFlowByName(name) {
    const rows = this.db.prepare("SELECT * FROM flows WHERE LOWER(name) LIKE ?").all(`%${name.toLowerCase()}%`);
    return rows.length === 1 ? this.mapFlow(rows[0]) : null;
  }
  listFlows() {
    return this.db.prepare("SELECT * FROM flows ORDER BY updated_at DESC").all().map((r) => this.mapFlow(r));
  }
  updateFlow(id, data) {
    const updates = [];
    const values = [];
    if (data.name !== void 0) {
      updates.push("name = ?");
      values.push(data.name);
    }
    if (data.description !== void 0) {
      updates.push("description = ?");
      values.push(data.description);
    }
    if (data.appUrl !== void 0) {
      updates.push("app_url = ?");
      values.push(data.appUrl);
    }
    if (data.graph !== void 0) {
      updates.push("graph = ?");
      values.push(JSON.stringify(data.graph));
    }
    updates.push("updated_at = datetime('now')");
    values.push(id);
    this.db.prepare(`UPDATE flows SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    return this.getFlow(id);
  }
  deleteFlow(id) {
    return this.db.prepare("DELETE FROM flows WHERE id = ?").run(id).changes > 0;
  }
  mapFlow(r) {
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      appUrl: r.app_url,
      graph: r.graph,
      createdAt: new Date(r.created_at),
      updatedAt: new Date(r.updated_at)
    };
  }
  // ---- Runs ----
  createRun(flowId) {
    const id = (0, import_uuid.v4)();
    this.db.prepare(`INSERT INTO runs (id, flow_id, status, started_at) VALUES (?, ?, 'running', datetime('now'))`).run(id, flowId);
    return this.getRun(id);
  }
  getRun(id) {
    const r = this.db.prepare("SELECT * FROM runs WHERE id = ?").get(id);
    return r ? this.mapRun(r) : null;
  }
  findRunByPartialId(q) {
    const rows = this.db.prepare("SELECT * FROM runs WHERE id LIKE ?").all(q + "%");
    return rows.length === 1 ? this.mapRun(rows[0]) : null;
  }
  listRuns(flowId, limit = 50) {
    const sql = flowId ? "SELECT * FROM runs WHERE flow_id = ? ORDER BY started_at DESC LIMIT ?" : "SELECT * FROM runs ORDER BY started_at DESC LIMIT ?";
    const params = flowId ? [flowId, limit] : [limit];
    return this.db.prepare(sql).all(...params).map((r) => this.mapRun(r));
  }
  updateRun(id, data) {
    const updates = [];
    const values = [];
    if (data.status !== void 0) {
      updates.push("status = ?");
      values.push(data.status);
    }
    if (data.completedAt !== void 0) {
      updates.push("completed_at = ?");
      values.push(data.completedAt.toISOString());
    }
    if (data.duration !== void 0) {
      updates.push("duration = ?");
      values.push(data.duration);
    }
    if (data.errorMessage !== void 0) {
      updates.push("error_message = ?");
      values.push(data.errorMessage);
    }
    if (data.summary !== void 0) {
      updates.push("summary = ?");
      values.push(data.summary);
    }
    values.push(id);
    if (updates.length > 0) this.db.prepare(`UPDATE runs SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    return this.getRun(id);
  }
  mapRun(r) {
    return {
      id: r.id,
      flowId: r.flow_id,
      status: r.status,
      startedAt: new Date(r.started_at),
      completedAt: r.completed_at ? new Date(r.completed_at) : null,
      duration: r.duration,
      errorMessage: r.error_message,
      summary: r.summary
    };
  }
  // ---- Steps ----
  createStep(data) {
    const id = (0, import_uuid.v4)();
    this.db.prepare(`INSERT INTO steps (id, run_id, step_number, name, action, selector, value, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`).run(id, data.runId, data.stepNumber, data.name, data.action, data.selector || null, data.value || null);
    return this.getStep(id);
  }
  getStep(id) {
    const r = this.db.prepare("SELECT * FROM steps WHERE id = ?").get(id);
    return r ? this.mapStep(r) : null;
  }
  listSteps(runId) {
    return this.db.prepare("SELECT * FROM steps WHERE run_id = ? ORDER BY step_number").all(runId).map((r) => this.mapStep(r));
  }
  updateStep(id, data) {
    const updates = [];
    const values = [];
    if (data.status !== void 0) {
      updates.push("status = ?");
      values.push(data.status);
    }
    if (data.duration !== void 0) {
      updates.push("duration = ?");
      values.push(data.duration);
    }
    if (data.errorMessage !== void 0) {
      updates.push("error_message = ?");
      values.push(data.errorMessage);
    }
    if (data.screenshotPath !== void 0) {
      updates.push("screenshot_path = ?");
      values.push(data.screenshotPath);
    }
    values.push(id);
    if (updates.length > 0) this.db.prepare(`UPDATE steps SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    return this.getStep(id);
  }
  mapStep(r) {
    return {
      id: r.id,
      runId: r.run_id,
      stepNumber: r.step_number,
      name: r.name,
      action: r.action,
      selector: r.selector,
      value: r.value,
      status: r.status,
      duration: r.duration,
      errorMessage: r.error_message,
      screenshotPath: r.screenshot_path
    };
  }
  getScreenshotsPath(runId) {
    const dir = path.join(DATA_PATH, "screenshots", runId);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
  // ---- Schedules ----
  createSchedule(data) {
    const id = (0, import_uuid.v4)();
    this.db.prepare(`INSERT INTO schedules (id, flow_id, name, cron_expression) VALUES (?, ?, ?, ?)`).run(id, data.flowId, data.name, data.cronExpression);
    return this.getSchedule(id);
  }
  getSchedule(id) {
    const r = this.db.prepare("SELECT * FROM schedules WHERE id = ?").get(id);
    return r ? this.mapSchedule(r) : null;
  }
  listSchedules() {
    return this.db.prepare("SELECT s.*, f.name as flow_name FROM schedules s JOIN flows f ON s.flow_id = f.id ORDER BY s.created_at DESC").all().map((r) => this.mapSchedule(r));
  }
  deleteSchedule(id) {
    return this.db.prepare("DELETE FROM schedules WHERE id = ?").run(id).changes > 0;
  }
  updateScheduleLastRun(id, status) {
    this.db.prepare(`UPDATE schedules SET last_run_at = datetime('now'), last_run_status = ? WHERE id = ?`).run(status, id);
  }
  mapSchedule(r) {
    return {
      id: r.id,
      flowId: r.flow_id,
      flowName: r.flow_name,
      name: r.name,
      cronExpression: r.cron_expression,
      enabled: Boolean(r.enabled),
      lastRunAt: r.last_run_at ? new Date(r.last_run_at) : null,
      lastRunStatus: r.last_run_status
    };
  }
  close() {
    this.db.close();
  }
};
function sanitizePII(text) {
  if (!text) return text;
  text = text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL]");
  text = text.replace(/(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, "[PHONE]");
  text = text.replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, "[CARD]");
  text = text.replace(/(api[_-]?key|apikey)["\s:=]+["']?[a-zA-Z0-9_-]{20,}["']?/gi, "API_KEY=[TOKEN]");
  text = text.replace(/eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g, "[JWT]");
  text = text.replace(/\b(?:password|passwd|pwd)\s*[:=]\s*\S+/gi, "password=[REDACTED]");
  text = text.replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN]");
  return text;
}
async function isOllamaRunning() {
  const baseUrl = process.env.FLOWMIND_OLLAMA_URL || "http://localhost:11434";
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(2e3) });
    if (!res.ok) return null;
    const data = await res.json();
    const preferred = process.env.FLOWMIND_OLLAMA_MODEL;
    if (preferred) return preferred;
    const models = data.models || [];
    const gemma = models.find((m) => m.name.startsWith("gemma"));
    return gemma?.name || models[0]?.name || null;
  } catch {
    return null;
  }
}
async function callOllama(prompt) {
  const baseUrl = process.env.FLOWMIND_OLLAMA_URL || "http://localhost:11434";
  const model = process.env.FLOWMIND_OLLAMA_MODEL || await isOllamaRunning();
  if (!model) return null;
  try {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], stream: false }),
      signal: AbortSignal.timeout(3e4)
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}
async function callAnthropic(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 250,
      messages: [{ role: "user", content: prompt }]
    });
    const content = msg.content[0];
    return content.type === "text" ? content.text.trim() : null;
  } catch {
    return null;
  }
}
async function callAI(prompt) {
  const provider = process.env.FLOWMIND_AI_PROVIDER;
  if (provider !== "anthropic") {
    const result2 = await callOllama(prompt);
    if (result2) return { text: result2, provider: process.env.FLOWMIND_OLLAMA_MODEL || "ollama" };
    if (provider === "ollama") return null;
  }
  const result = await callAnthropic(prompt);
  if (result) return { text: result, provider: "claude" };
  return null;
}
function buildFailurePrompt(ctx) {
  const stepsSummary = ctx.steps.map(
    (s) => `  Step ${s.stepNumber} [${s.status}]: ${s.name} (${s.action}${s.selector ? ` on "${s.selector}"` : ""})`
  ).join("\n");
  return `A web automation flow named "${ctx.flowName}" failed during a browser test.

Steps run:
${stepsSummary}

Failed step: "${ctx.failedStep.name}"
Action: ${ctx.failedStep.action}${ctx.failedStep.selector ? ` on selector "${ctx.failedStep.selector}"` : ""}
Error: ${ctx.failedStep.errorMessage}

Respond in exactly this format (no extra text):

WHAT FAILED
<one sentence describing which step failed and what it was trying to do>

WHY IT FAILED
<one or two sentences on the likely root cause \u2014 selector broken, page changed, timing issue, etc.>

HOW TO FIX IT
<one or two specific, actionable steps the developer can take right now>`;
}
function printLogo() {
  console.log(import_chalk.default.cyan(`
  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557
  \u2551                                           \u2551
  \u2551   \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2557      \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2557    \u2588\u2588\u2557     \u2551
  \u2551   \u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u2588\u2588\u2551     \u2588\u2588\u2554\u2550\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2551    \u2588\u2588\u2551     \u2551
  \u2551   \u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2551     \u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2551 \u2588\u2557 \u2588\u2588\u2551     \u2551
  \u2551   \u2588\u2588\u2554\u2550\u2550\u255D  \u2588\u2588\u2551     \u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2551\u2588\u2588\u2588\u2557\u2588\u2588\u2551     \u2551
  \u2551   \u2588\u2588\u2551     \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u255A\u2588\u2588\u2588\u2554\u2588\u2588\u2588\u2554\u255D     \u2551
  \u2551   \u255A\u2550\u255D     \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D \u255A\u2550\u2550\u2550\u2550\u2550\u255D  \u255A\u2550\u2550\u255D\u255A\u2550\u2550\u255D      \u2551
  \u2551                                           \u2551
  \u2551   Memory-driven Web Automation            \u2551
  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D
  `));
}
function info(msg) {
  console.log(import_chalk.default.blue("  \u2192 ") + msg);
}
function success(msg) {
  console.log(import_chalk.default.green("  \u2713 ") + msg);
}
function errorMsg(msg) {
  console.log(import_chalk.default.red("  \u2717 ") + msg);
}
function warn(msg) {
  console.log(import_chalk.default.yellow("  \u26A0 ") + msg);
}
function divider() {
  console.log(import_chalk.default.cyan("\u2500".repeat(60)));
}
function askQuestion(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (a) => {
      rl.close();
      resolve(a.trim());
    });
  });
}
function waitForDone() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log(import_chalk.default.gray('\n  Press ENTER or type "done" to finish recording:\n'));
    rl.on("line", (line) => {
      if (["", "done", "stop", "finish"].includes(line.trim().toLowerCase())) {
        rl.close();
        resolve();
      }
    });
    rl.on("close", () => resolve());
  });
}
var RECORDER_SCRIPT = `
(function() {
  if (window.__flowmindInjected) return;
  window.__flowmindInjected = true;

  function getBestSelector(el) {
    if (!el || el === document.body || el === document.documentElement) return 'body';
    if (el.id && !el.id.match(/^\\d/)) return '#' + CSS.escape(el.id);
    const testId = el.getAttribute('data-testid') || el.getAttribute('data-test-id') || el.getAttribute('data-cy');
    if (testId) return '[data-testid="' + CSS.escape(testId) + '"]';
    const name = el.getAttribute('name');
    if (name) return '[name="' + CSS.escape(name) + '"]';
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return '[aria-label="' + CSS.escape(ariaLabel) + '"]';
    const placeholder = el.getAttribute('placeholder');
    if (placeholder) return '[placeholder="' + CSS.escape(placeholder) + '"]';
    const tag = el.tagName.toLowerCase();
    if (el.type && el.type !== 'text') return tag + '[type="' + el.type + '"]';
    if (tag === 'button' || tag === 'a') {
      const text = (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40);
      if (text) return tag + ':has-text("' + text + '")';
    }
    const unstable = /^(active|focus|hover|selected|disabled|open|close|show|hide|is-|has-|js-)/;
    const classes = Array.from(el.classList).filter(c => !unstable.test(c)).slice(0, 2);
    if (classes.length > 0) return tag + '.' + classes.map(c => CSS.escape(c)).join('.');
    return tag;
  }

  function isInputField(el) {
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    if (tag === 'textarea') return true;
    if (tag === 'input') {
      const t = (el.type || 'text').toLowerCase();
      return ['text','email','password','search','url','number','tel','date','time','datetime-local','month','week'].includes(t);
    }
    return false;
  }

  function isInteractable(el) {
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    return ['button','a','select'].includes(tag) || ['button','link','menuitem','tab','option'].includes(el.getAttribute('role') || '') || el.getAttribute('tabindex') === '0';
  }

  let lastClickTime = 0; let lastClickSel = '';
  document.addEventListener('click', function(e) {
    let target = e.target;
    let node = target;
    for (let i = 0; i < 4; i++) {
      if (!node || node === document.body) break;
      if (isInteractable(node)) { target = node; break; }
      node = node.parentElement;
    }
    if (isInputField(target)) return;
    const sel = getBestSelector(target);
    const now = Date.now();
    if (sel === lastClickSel && now - lastClickTime < 400) return;
    lastClickTime = now; lastClickSel = sel;
    const label = ((target.innerText || target.textContent || '').trim().replace(/\\s+/g, ' ')).slice(0, 40);
    window.__flowmindRecord({ type: 'click', selector: sel, label: label, url: window.location.href, timestamp: now });
  }, true);

  document.addEventListener('blur', function(e) {
    const target = e.target;
    if (!isInputField(target) || !target.value) return;
    window.__flowmindRecord({ type: 'fill', selector: getBestSelector(target), value: target.value, url: window.location.href, timestamp: Date.now() });
  }, true);

  document.addEventListener('change', function(e) {
    const target = e.target;
    const tag = target.tagName ? target.tagName.toLowerCase() : '';
    if (tag === 'select') window.__flowmindRecord({ type: 'select', selector: getBestSelector(target), value: target.value, url: window.location.href, timestamp: Date.now() });
    if (tag === 'input' && (target.type === 'checkbox' || target.type === 'radio'))
      window.__flowmindRecord({ type: 'check', selector: getBestSelector(target), value: String(target.checked), url: window.location.href, timestamp: Date.now() });
  }, true);
})();
`;
async function runLearn(url) {
  printLogo();
  divider();
  let flowName = args[2];
  if (!flowName) {
    console.log(import_chalk.default.cyan("\n  Enter flow name: "));
    flowName = await askQuestion("  > ");
  }
  if (!flowName) {
    errorMsg("Flow name required");
    process.exit(1);
  }
  info("Target URL: " + import_chalk.default.cyan(url));
  info("Flow name:  " + import_chalk.default.cyan(flowName));
  console.log();
  const flow = db.createFlow({ name: flowName, appUrl: url });
  const capturedActions = [];
  let browserClosed = false;
  const browser = await import_playwright.chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.exposeFunction("__flowmindRecord", (action) => {
    const last = capturedActions[capturedActions.length - 1];
    if (last && last.type === action.type && last.selector === action.selector && Date.now() - last.timestamp < 500) return;
    const sanitized = { ...action, value: action.value ? sanitizePII(action.value) : action.value };
    capturedActions.push(sanitized);
    const icons = { click: "\u{1F5B1} ", fill: "\u2328\uFE0F ", select: "\u{1F4CB}", navigate: "\u{1F310}", check: "\u2611\uFE0F " };
    let label = "";
    if (action.type === "click") label = `click ${action.label ? import_chalk.default.white(`"${action.label}"`) : ""} ${import_chalk.default.gray(action.selector)}`;
    else if (action.type === "fill") label = `fill ${import_chalk.default.gray(action.selector)} = ${import_chalk.default.yellow(`"${sanitized.value?.slice(0, 30)}"`)}`;
    else if (action.type === "select") label = `select ${import_chalk.default.gray(action.selector)} \u2192 ${import_chalk.default.yellow(action.value)}`;
    else if (action.type === "navigate") label = `navigate \u2192 ${import_chalk.default.cyan(action.url)}`;
    else if (action.type === "check") label = `check ${import_chalk.default.gray(action.selector)} (${action.value})`;
    process.stdout.write(`  ${import_chalk.default.green(icons[action.type] || "\u25CF")} ${label}
`);
  });
  await page.addInitScript(RECORDER_SCRIPT);
  let lastNavTime = 0;
  page.on("framenavigated", (frame) => {
    if (frame !== page.mainFrame()) return;
    const navUrl = frame.url();
    if (navUrl === "about:blank" || navUrl === url) return;
    const now = Date.now();
    const last = capturedActions[capturedActions.length - 1];
    if (last && last.type === "click" && now - last.timestamp < 1500) return;
    if (now - lastNavTime < 300) return;
    lastNavTime = now;
    capturedActions.push({ type: "navigate", url: navUrl, timestamp: now });
    process.stdout.write(`  ${import_chalk.default.green("\u{1F310}")} navigate \u2192 ${import_chalk.default.cyan(navUrl)}
`);
  });
  browser.on("disconnected", () => {
    browserClosed = true;
  });
  console.log(import_chalk.default.bold("  Browser is open \u2014 interact with it normally.\n"));
  console.log(import_chalk.default.gray("  Every click, fill, and navigation is captured automatically.\n"));
  await page.goto(url);
  if (!browserClosed) await waitForDone().catch(() => {
  });
  if (!browserClosed) await browser.close();
  if (capturedActions.length === 0) {
    warn("No actions captured. Flow not saved.");
    db.deleteFlow(flow.id);
    process.exit(0);
  }
  const nodes = [{ id: "start", type: "start", label: "Start", url }];
  const edges = [];
  let prevId = "start";
  capturedActions.forEach((action, i) => {
    const nodeId = `step-${i + 1}`;
    let node;
    if (action.type === "navigate") node = { id: nodeId, type: "action", label: `Navigate to ${action.url}`, action: "navigate", url: action.url };
    else if (action.type === "click") node = { id: nodeId, type: "action", label: action.label ? `Click "${action.label}"` : `Click ${action.selector}`, action: "click", selector: action.selector };
    else if (action.type === "fill") node = { id: nodeId, type: "action", label: `Fill ${action.selector}`, action: "fill", selector: action.selector, value: action.value };
    else if (action.type === "select") node = { id: nodeId, type: "action", label: `Select "${action.value}" in ${action.selector}`, action: "select", selector: action.selector, value: action.value };
    else if (action.type === "check") node = { id: nodeId, type: "action", label: `${action.value === "true" ? "Check" : "Uncheck"} ${action.selector}`, action: "check", selector: action.selector, value: action.value };
    else return;
    nodes.push(node);
    edges.push({ id: `e${i}`, source: prevId, target: nodeId });
    prevId = nodeId;
  });
  nodes.push({ id: "end", type: "end", label: "End" });
  edges.push({ id: `e${capturedActions.length}`, source: prevId, target: "end" });
  db.updateFlow(flow.id, { graph: { nodes, edges, appUrl: url } });
  divider();
  success(`${capturedActions.length} actions recorded`);
  const counts = capturedActions.reduce((a, c) => {
    a[c.type] = (a[c.type] || 0) + 1;
    return a;
  }, {});
  Object.entries(counts).forEach(([t, n]) => info(`  ${t}: ${n}`));
  console.log();
  info("Run with: " + import_chalk.default.green(`node flowmind.js run ${flow.id.slice(0, 8)}`));
  console.log();
}
async function executeFlow(flowId) {
  let flow = db.findFlowByPartialId(flowId) || db.findFlowByName(flowId);
  if (!flow) {
    errorMsg("Flow not found: " + flowId);
    process.exit(1);
  }
  let graph;
  try {
    graph = JSON.parse(flow.graph);
  } catch {
    errorMsg("Invalid graph");
    process.exit(1);
    return { passed: false, runId: "", duration: 0 };
  }
  if (!graph.nodes?.length) {
    warn("Empty flow.");
    return { passed: false, runId: "", duration: 0 };
  }
  const run = db.createRun(flow.id);
  const screenshotsDir = db.getScreenshotsPath(run.id);
  const browser = await import_playwright.chromium.launch({ headless: true });
  const page = await browser.newPage();
  const startUrl = graph.appUrl || flow.appUrl;
  if (startUrl) await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 15e3 });
  const actionNodes = graph.nodes.filter((n) => n.type === "action");
  let stepNum = 1, failed = false;
  let failedStepInfo = null;
  const runStart = Date.now();
  for (const node of actionNodes) {
    const label = node.label, action = node.action;
    console.log(import_chalk.default.cyan(`
  [${stepNum}/${actionNodes.length}] ${label}`));
    const step = db.createStep({ runId: run.id, stepNumber: stepNum, name: label, action, selector: node.selector, value: node.value });
    const t = Date.now();
    try {
      await executeAction(page, action, node);
      if (action === "click") {
        await page.waitForLoadState("domcontentloaded", { timeout: 3e3 }).catch(() => {
        });
      }
      const duration = Date.now() - t;
      const screenshot = await page.screenshot();
      const sp = path.join(screenshotsDir, `step-${stepNum}.png`);
      fs.writeFileSync(sp, screenshot);
      db.updateStep(step.id, { status: "passed", duration, screenshotPath: sp });
      console.log(import_chalk.default.green(`      \u2713 passed (${duration}ms)`));
    } catch (err) {
      const duration = Date.now() - t;
      const errorMessage = err instanceof Error ? err.message.split("\n")[0] : String(err);
      try {
        const screenshot = await page.screenshot();
        const sp = path.join(screenshotsDir, `step-${stepNum}-FAILED.png`);
        fs.writeFileSync(sp, screenshot);
        db.updateStep(step.id, { status: "failed", duration, errorMessage, screenshotPath: sp });
      } catch {
        db.updateStep(step.id, { status: "failed", duration, errorMessage });
      }
      console.log(import_chalk.default.red(`      \u2717 failed (${duration}ms)`));
      console.log(import_chalk.default.red(`        \u2514\u2500 ${errorMessage}`));
      failedStepInfo = { name: label, action, selector: node.selector, errorMessage };
      failed = true;
      break;
    }
    stepNum++;
  }
  await browser.close();
  const totalDuration = Date.now() - runStart;
  let summary = null;
  if (failed && failedStepInfo) {
    process.stdout.write(import_chalk.default.gray("\n  Analyzing failure...\n"));
    const steps = db.listSteps(run.id);
    const result = await callAI(buildFailurePrompt({ flowName: flow.name, steps: steps.map((s) => ({ stepNumber: s.stepNumber, name: s.name, action: s.action, selector: s.selector, status: s.status, errorMessage: s.errorMessage })), failedStep: failedStepInfo }));
    if (result) {
      summary = result.text;
      process.stdout.write(import_chalk.default.gray(`  (via ${result.provider})
`));
    }
  }
  db.updateRun(run.id, { status: failed ? "failed" : "passed", completedAt: /* @__PURE__ */ new Date(), duration: totalDuration, errorMessage: failedStepInfo?.errorMessage, summary: summary || void 0 });
  divider();
  if (failed) {
    errorMsg("Flow failed");
    if (summary) {
      console.log();
      console.log(import_chalk.default.bgRed.white.bold("  FAILURE REPORT  "));
      console.log();
      for (const line of summary.split("\n")) {
        const trimmed = line.trim();
        if (/^(WHAT FAILED|WHY IT FAILED|HOW TO FIX IT)$/.test(trimmed)) {
          console.log(import_chalk.default.yellow.bold("  " + trimmed));
        } else if (trimmed) {
          console.log(import_chalk.default.white("    " + trimmed));
        }
      }
      console.log();
    }
  } else {
    success(`Flow passed! (${totalDuration}ms)`);
  }
  info("Run ID: " + import_chalk.default.gray(run.id.slice(0, 8)));
  info("Screenshots: " + import_chalk.default.cyan(screenshotsDir));
  console.log();
  return { passed: !failed, runId: run.id, duration: totalDuration };
}
async function executeAction(page, action, node) {
  switch (action) {
    case "navigate":
      await page.goto(node.url || node.value, { waitUntil: "domcontentloaded", timeout: 15e3 });
      break;
    case "click":
      await page.click(node.selector, { timeout: 1e4 });
      break;
    case "fill":
      await page.fill(node.selector, sanitizePII(node.value || ""), { timeout: 1e4 });
      break;
    case "select":
      await page.selectOption(node.selector, node.value || "", { timeout: 1e4 });
      break;
    case "check":
      if (node.value === "true") await page.check(node.selector, { timeout: 1e4 });
      else await page.uncheck(node.selector, { timeout: 1e4 });
      break;
    case "wait":
      await page.waitForSelector(node.selector, { timeout: 1e4 });
      break;
    case "press":
      await page.press(node.selector, node.value || "Enter");
      break;
  }
}
async function runFlow(id) {
  printLogo();
  divider();
  let flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
  if (!flow) {
    errorMsg("Flow not found: " + id);
    process.exit(1);
  }
  console.log(import_chalk.default.bold("\n  Running: ") + import_chalk.default.white(flow.name) + "\n");
  await executeFlow(id);
}
async function runFixFlow(id) {
  printLogo();
  divider();
  let flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
  if (!flow) {
    errorMsg("Flow not found: " + id);
    process.exit(1);
  }
  console.log(import_chalk.default.bold(`
  Fixing: ${flow.name}
`));
  console.log(import_chalk.default.gray("  Steps will replay automatically. When one fails,"));
  console.log(import_chalk.default.gray("  click the correct element in the browser.\n"));
  let graph;
  try {
    graph = JSON.parse(flow.graph);
  } catch {
    errorMsg("Invalid graph");
    process.exit(1);
    return;
  }
  const actionNodes = graph.nodes.filter((n) => n.type === "action");
  if (!actionNodes.length) {
    warn("No action steps in this flow.");
    return;
  }
  let waitingForFix = false;
  let fixResolve = null;
  let fixesApplied = 0;
  const browser = await import_playwright.chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.exposeFunction("__flowmindRecord", (action) => {
    if (waitingForFix && fixResolve && action.type === "click") {
      fixResolve(action);
      fixResolve = null;
      waitingForFix = false;
    }
  });
  await page.addInitScript(RECORDER_SCRIPT);
  const startUrl = graph.appUrl || flow.appUrl;
  if (startUrl) await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 15e3 });
  for (let i = 0; i < actionNodes.length; i++) {
    const node = actionNodes[i];
    const label = node.label;
    console.log(import_chalk.default.cyan(`
  [${i + 1}/${actionNodes.length}] ${label}`));
    try {
      await executeAction(page, node.action, node);
      if (node.action === "click") await page.waitForLoadState("domcontentloaded", { timeout: 3e3 }).catch(() => {
      });
      console.log(import_chalk.default.green("      \u2713 passed"));
    } catch (err) {
      const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
      console.log(import_chalk.default.red(`      \u2717 failed: ${msg}`));
      console.log(import_chalk.default.yellow(`
      Current selector: ${import_chalk.default.white(node.selector || "(none)")}`));
      console.log(import_chalk.default.yellow("      Click the correct element in the browser..."));
      try {
        await page.evaluate((sel) => {
          document.querySelectorAll("[data-fm-highlight]").forEach((e) => e.removeAttribute("data-fm-highlight"));
          const el = document.querySelector(sel);
          if (el) {
            el.style.outline = "3px solid red";
            el.style.outlineOffset = "2px";
          }
        }, node.selector);
      } catch {
      }
      const captured = await new Promise((resolve) => {
        waitingForFix = true;
        fixResolve = resolve;
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.on("line", (line) => {
          if (line.trim().toLowerCase() === "skip") {
            waitingForFix = false;
            fixResolve = null;
            rl.close();
            resolve({ type: "skip", timestamp: Date.now() });
          }
        });
        const origResolve = fixResolve;
        fixResolve = (a) => {
          rl.close();
          origResolve(a);
        };
      });
      if (captured.type === "skip") {
        warn("      Skipped \u2014 selector unchanged.");
        continue;
      }
      const oldSelector = node.selector;
      node.selector = captured.selector;
      if (node.label && typeof node.label === "string" && captured.label) {
      }
      console.log(import_chalk.default.green(`      \u2713 Updated: ${import_chalk.default.gray(oldSelector)} \u2192 ${import_chalk.default.white(captured.selector)}`));
      fixesApplied++;
      try {
        await executeAction(page, node.action, node);
        if (node.action === "click") await page.waitForLoadState("domcontentloaded", { timeout: 3e3 }).catch(() => {
        });
        console.log(import_chalk.default.green("      \u2713 Retry passed"));
      } catch (retryErr) {
        warn(`      Retry also failed: ${retryErr instanceof Error ? retryErr.message.split("\n")[0] : retryErr}`);
        warn("      Continuing anyway \u2014 you may need to fix this step again.");
      }
    }
  }
  await browser.close();
  if (fixesApplied > 0) {
    db.updateFlow(flow.id, { graph: { ...graph, nodes: graph.nodes } });
    divider();
    success(`${fixesApplied} selector${fixesApplied > 1 ? "s" : ""} fixed and saved.`);
    info(`Run: ${import_chalk.default.green(`node flowmind.js run ${flow.id.slice(0, 8)}`)}`);
  } else {
    divider();
    info("No fixes needed \u2014 all selectors work.");
  }
  console.log();
}
async function runDiff(runId1, runId2) {
  const run1 = db.findRunByPartialId(runId1);
  const run2 = db.findRunByPartialId(runId2);
  if (!run1) {
    errorMsg("Run not found: " + runId1);
    process.exit(1);
  }
  if (!run2) {
    errorMsg("Run not found: " + runId2);
    process.exit(1);
  }
  const steps1 = db.listSteps(run1.id);
  const steps2 = db.listSteps(run2.id);
  const flow = db.getFlow(run1.flowId);
  console.log(import_chalk.default.bold(`
  Screenshot Diff: ${flow?.name || "Unknown"}
`));
  console.log(`  ${import_chalk.default.gray("Run A:")} ${run1.id.slice(0, 8)} ${import_chalk.default.gray("(" + run1.status + ")")}`);
  console.log(`  ${import_chalk.default.gray("Run B:")} ${run2.id.slice(0, 8)} ${import_chalk.default.gray("(" + run2.status + ")")}
`);
  let PNG;
  let pixelmatch2;
  try {
    const pngjs = await Promise.resolve().then(() => __toESM(require_png()));
    PNG = pngjs.PNG;
    pixelmatch2 = (await Promise.resolve().then(() => (init_pixelmatch(), pixelmatch_exports))).default;
  } catch {
    errorMsg("Missing dependencies. Run: npm install pixelmatch pngjs");
    process.exit(1);
    return;
  }
  const diffDir = path.join(DATA_PATH, "diffs", `${run1.id.slice(0, 8)}_vs_${run2.id.slice(0, 8)}`);
  fs.mkdirSync(diffDir, { recursive: true });
  const maxSteps = Math.max(steps1.length, steps2.length);
  let changed = 0, same = 0, missing = 0;
  console.log(import_chalk.default.gray("  Step  Status    Diff %  Screenshot"));
  console.log(import_chalk.default.gray("  " + "\u2500".repeat(58)));
  for (let i = 1; i <= maxSteps; i++) {
    const s1 = steps1.find((s) => s.stepNumber === i);
    const s2 = steps2.find((s) => s.stepNumber === i);
    const name = (s1?.name || s2?.name || `Step ${i}`).slice(0, 30);
    const p1 = s1?.screenshotPath;
    const p2 = s2?.screenshotPath;
    if (!p1 || !p2 || !fs.existsSync(p1) || !fs.existsSync(p2)) {
      console.log(`  ${import_chalk.default.gray(String(i).padStart(4))}  ${import_chalk.default.yellow("missing  ")}  ${import_chalk.default.gray("N/A    ")}  ${import_chalk.default.gray(name)}`);
      missing++;
      continue;
    }
    try {
      const img1 = PNG.sync.read(fs.readFileSync(p1));
      const img2 = PNG.sync.read(fs.readFileSync(p2));
      const w = Math.min(img1.width, img2.width);
      const h = Math.min(img1.height, img2.height);
      const diff = new PNG({ width: w, height: h });
      const numDiff = pixelmatch2(img1.data, img2.data, diff.data, w, h, { threshold: 0.1 });
      const pct = (numDiff / (w * h) * 100).toFixed(1);
      const diffPath = path.join(diffDir, `step-${i}-diff.png`);
      fs.writeFileSync(diffPath, PNG.sync.write(diff));
      const isChanged = parseFloat(pct) > 0.5;
      if (isChanged) changed++;
      else same++;
      const statusLabel = isChanged ? import_chalk.default.yellow("changed  ") : import_chalk.default.green("same     ");
      const pctLabel = isChanged ? import_chalk.default.yellow(pct.padStart(5) + "%") : import_chalk.default.gray(pct.padStart(5) + "%");
      console.log(`  ${import_chalk.default.gray(String(i).padStart(4))}  ${statusLabel}  ${pctLabel}  ${import_chalk.default.white(name)}`);
    } catch {
      console.log(`  ${import_chalk.default.gray(String(i).padStart(4))}  ${import_chalk.default.red("error    ")}  ${import_chalk.default.gray("N/A    ")}  ${import_chalk.default.gray(name)}`);
      missing++;
    }
  }
  console.log(import_chalk.default.gray("\n  " + "\u2500".repeat(58)));
  console.log(`  ${import_chalk.default.green(same + " same")}  ${import_chalk.default.yellow(changed + " changed")}  ${missing ? import_chalk.default.gray(missing + " missing") : ""}`);
  console.log(`
  ${import_chalk.default.gray("Diff images:")} ${import_chalk.default.cyan(diffDir)}
`);
}
async function runListFlows() {
  const flows = db.listFlows();
  console.log(import_chalk.default.bold("\n  Your Flows\n"));
  if (flows.length === 0) {
    warn("No flows. Create one: " + import_chalk.default.cyan("node flowmind.js learn <url>"));
    console.log();
    return;
  }
  console.log(import_chalk.default.gray("  ID        Name                          Steps  Updated"));
  console.log(import_chalk.default.gray("  " + "\u2500".repeat(62)));
  for (const flow of flows) {
    let steps = 0;
    try {
      steps = (JSON.parse(flow.graph).nodes || []).filter((n) => n.type === "action").length;
    } catch {
    }
    console.log(`  ${import_chalk.default.gray(flow.id.slice(0, 8))} ${import_chalk.default.white(flow.name.padEnd(28).slice(0, 28))} ${import_chalk.default.gray(String(steps).padEnd(6))} ${import_chalk.default.gray(flow.updatedAt.toLocaleDateString())}`);
  }
  console.log();
}
async function runDeleteFlow(id) {
  const flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
  if (!flow) {
    errorMsg("Flow not found: " + id);
    process.exit(1);
  }
  const confirm = await askQuestion(`  Delete "${import_chalk.default.yellow(flow.name)}"? (y/N) `);
  if (confirm.toLowerCase() !== "y") {
    warn("Cancelled");
    return;
  }
  db.deleteFlow(flow.id);
  success(`Deleted: ${flow.name}`);
  console.log();
}
async function runExportFlow(id) {
  const flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
  if (!flow) {
    errorMsg("Flow not found: " + id);
    process.exit(1);
  }
  const filename = `${flow.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.flow.json`;
  fs.writeFileSync(filename, JSON.stringify({ version: "1.0.0", exportedAt: (/* @__PURE__ */ new Date()).toISOString(), flow: { name: flow.name, description: flow.description, appUrl: flow.appUrl, graph: JSON.parse(flow.graph) } }, null, 2));
  success(`Exported to ${import_chalk.default.cyan(filename)}`);
  console.log();
}
async function runImportFlow(filepath) {
  if (!fs.existsSync(filepath)) {
    errorMsg("File not found: " + filepath);
    process.exit(1);
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(filepath, "utf8"));
  } catch {
    errorMsg("Invalid JSON");
    process.exit(1);
    return;
  }
  const created = db.createFlow({ name: data.flow.name, description: data.flow.description, appUrl: data.flow.appUrl, graph: data.flow.graph });
  success(`Imported: ${import_chalk.default.white(data.flow.name)}`);
  info("ID: " + import_chalk.default.gray(created.id.slice(0, 8)));
  console.log();
}
async function runListRuns() {
  const runs = db.listRuns(void 0, 20);
  console.log(import_chalk.default.bold("\n  Recent Runs\n"));
  if (runs.length === 0) {
    warn("No runs yet.");
    console.log();
    return;
  }
  console.log(import_chalk.default.gray("  ID        Flow                           Status       Duration"));
  console.log(import_chalk.default.gray("  " + "\u2500".repeat(72)));
  for (const run of runs) {
    const flow = db.getFlow(run.flowId);
    const statusColor = run.status === "passed" ? import_chalk.default.green : run.status === "failed" ? import_chalk.default.red : import_chalk.default.yellow;
    console.log(`  ${import_chalk.default.gray(run.id.slice(0, 8))} ${import_chalk.default.white((flow?.name || "Unknown").padEnd(28).slice(0, 28))} ${statusColor(run.status.padEnd(12))} ${import_chalk.default.gray(run.duration ? run.duration + "ms" : "-")}`);
  }
  console.log();
}
async function runShowRun(id) {
  const run = db.findRunByPartialId(id);
  if (!run) {
    errorMsg("Run not found: " + id);
    process.exit(1);
  }
  const flow = db.getFlow(run.flowId);
  const steps = db.listSteps(run.id);
  const statusColor = run.status === "passed" ? import_chalk.default.green : run.status === "failed" ? import_chalk.default.red : import_chalk.default.yellow;
  console.log(import_chalk.default.bold(`
  Run: ${run.id.slice(0, 8)}
`));
  const b = "\u2500".repeat(56);
  console.log(import_chalk.default.gray(`  \u250C${b}\u2510`));
  console.log(import_chalk.default.gray("  \u2502 ") + `Flow:     ${(flow?.name || "Unknown").padEnd(44)}` + import_chalk.default.gray("\u2502"));
  console.log(import_chalk.default.gray("  \u2502 ") + `Status:   ${statusColor(run.status).padEnd(53)}` + import_chalk.default.gray("\u2502"));
  console.log(import_chalk.default.gray("  \u2502 ") + `Duration: ${(run.duration ? run.duration + "ms" : "-").padEnd(44)}` + import_chalk.default.gray("\u2502"));
  console.log(import_chalk.default.gray(`  \u2514${b}\u2518`));
  console.log(import_chalk.default.bold("\n  Steps\n"));
  for (const step of steps) {
    const icon = step.status === "passed" ? import_chalk.default.green("\u2713") : step.status === "failed" ? import_chalk.default.red("\u2717") : import_chalk.default.gray("\u25CB");
    console.log(`    ${import_chalk.default.gray(String(step.stepNumber).padStart(2))}  ${icon}  ${import_chalk.default.white(step.name)} ${import_chalk.default.gray(step.duration ? step.duration + "ms" : "")}`);
    if (step.status === "failed" && step.errorMessage) console.log(`         ${import_chalk.default.red("\u2514\u2500 " + step.errorMessage.slice(0, 80))}`);
    if (step.screenshotPath) console.log(`         ${import_chalk.default.gray("\u{1F4F7} " + step.screenshotPath)}`);
  }
  if (run.status === "failed") {
    let summary = run.summary;
    if (!summary) {
      process.stdout.write(import_chalk.default.gray("\n  Analyzing failure...\n"));
      const failedStep = steps.find((s) => s.status === "failed");
      if (failedStep) {
        const result = await callAI(buildFailurePrompt({
          flowName: flow?.name || "Unknown",
          steps: steps.map((s) => ({ stepNumber: s.stepNumber, name: s.name, action: s.action, selector: s.selector, status: s.status, errorMessage: s.errorMessage })),
          failedStep: { name: failedStep.name, action: failedStep.action, selector: failedStep.selector, errorMessage: failedStep.errorMessage || "Unknown error" }
        }));
        if (result) {
          summary = result.text;
          db.updateRun(run.id, { summary });
        }
      }
    }
    if (summary) {
      console.log();
      console.log(import_chalk.default.bgRed.white.bold("  FAILURE REPORT  "));
      console.log();
      for (const line of summary.split("\n")) {
        const trimmed = line.trim();
        if (/^(WHAT FAILED|WHY IT FAILED|HOW TO FIX IT)$/.test(trimmed)) {
          console.log(import_chalk.default.yellow.bold("  " + trimmed));
        } else if (trimmed) {
          console.log(import_chalk.default.white("    " + trimmed));
        }
      }
    } else {
      console.log();
      warn("No AI provider available for analysis. Run Ollama locally or set ANTHROPIC_API_KEY.");
    }
  }
  console.log();
}
async function runAnalyzeRun(id) {
  const run = db.findRunByPartialId(id);
  if (!run) {
    errorMsg("Run not found: " + id);
    process.exit(1);
  }
  const flow = db.getFlow(run.flowId);
  const steps = db.listSteps(run.id);
  const failedStep = steps.find((s) => s.status === "failed");
  if (!failedStep) {
    info("Run passed \u2014 no failures to analyze.");
    return;
  }
  info("Analyzing failure...");
  const result = await callAI(buildFailurePrompt({
    flowName: flow?.name || "Unknown",
    steps: steps.map((s) => ({ stepNumber: s.stepNumber, name: s.name, action: s.action, selector: s.selector, status: s.status, errorMessage: s.errorMessage })),
    failedStep: { name: failedStep.name, action: failedStep.action, selector: failedStep.selector, errorMessage: failedStep.errorMessage || "Unknown error" }
  }));
  if (result) {
    db.updateRun(run.id, { summary: result.text });
    console.log();
    console.log(import_chalk.default.yellow(`  AI Analysis ${import_chalk.default.gray("(via " + result.provider + ")")}:`));
    console.log(import_chalk.default.white("  " + result.text.split("\n").join("\n  ")));
    console.log();
  } else {
    warn("No AI provider available. Run Ollama locally or set ANTHROPIC_API_KEY.");
    console.log(import_chalk.default.gray("  brew install ollama && ollama pull gemma3:4b"));
  }
}
async function runScheduleAdd(id, cronExpr) {
  let flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
  if (!flow) {
    errorMsg("Flow not found: " + id);
    process.exit(1);
  }
  let nodeCron;
  try {
    nodeCron = await Promise.resolve().then(() => __toESM(require_node_cron()));
  } catch {
    errorMsg("node-cron not installed. Run: npm install node-cron");
    process.exit(1);
    return;
  }
  if (!nodeCron.validate(cronExpr)) {
    errorMsg(`Invalid cron expression: "${cronExpr}"
  Example: "0 9 * * *" (daily at 9am)`);
    process.exit(1);
  }
  const schedule = db.createSchedule({ flowId: flow.id, name: flow.name, cronExpression: cronExpr });
  success(`Scheduled "${flow.name}"`);
  info(`Cron: ${import_chalk.default.cyan(cronExpr)}`);
  info(`ID:   ${import_chalk.default.gray(schedule.id.slice(0, 8))}`);
  console.log();
  console.log(import_chalk.default.gray("  Start the scheduler daemon with:"));
  console.log("  " + import_chalk.default.cyan("node flowmind.js serve"));
  console.log();
}
async function runScheduleList() {
  const schedules = db.listSchedules();
  console.log(import_chalk.default.bold("\n  Schedules\n"));
  if (schedules.length === 0) {
    warn("No schedules. Add one: " + import_chalk.default.cyan('node flowmind.js flow:schedule <id> "<cron>"'));
    console.log();
    return;
  }
  console.log(import_chalk.default.gray("  ID        Flow                    Cron            Last Run      Status"));
  console.log(import_chalk.default.gray("  " + "\u2500".repeat(78)));
  for (const s of schedules) {
    const lastRun = s.lastRunAt ? s.lastRunAt.toLocaleDateString() : import_chalk.default.gray("never");
    const statusColor = s.lastRunStatus === "passed" ? import_chalk.default.green : s.lastRunStatus === "failed" ? import_chalk.default.red : import_chalk.default.gray;
    const status = s.lastRunStatus ? statusColor(s.lastRunStatus) : import_chalk.default.gray("\u2014");
    console.log(`  ${import_chalk.default.gray(s.id.slice(0, 8))} ${import_chalk.default.white((s.flowName || s.name).padEnd(22).slice(0, 22))} ${import_chalk.default.cyan(s.cronExpression.padEnd(15))} ${String(lastRun).padEnd(13)} ${status}`);
  }
  console.log();
}
async function runScheduleRemove(id) {
  const schedules = db.listSchedules();
  const schedule = schedules.find((s) => s.id.startsWith(id));
  if (!schedule) {
    errorMsg("Schedule not found: " + id);
    process.exit(1);
  }
  db.deleteSchedule(schedule.id);
  success(`Removed schedule for "${schedule.name}"`);
  console.log();
}
async function runServe() {
  printLogo();
  divider();
  let nodeCron;
  try {
    nodeCron = await Promise.resolve().then(() => __toESM(require_node_cron()));
  } catch {
    errorMsg("node-cron not installed. Run: npm install node-cron");
    process.exit(1);
    return;
  }
  const schedules = db.listSchedules();
  if (schedules.length === 0) {
    warn("No schedules configured. Add one first:");
    info('node flowmind.js flow:schedule <id> "0 9 * * *"');
    process.exit(0);
  }
  console.log(import_chalk.default.bold(`
  Scheduler started \u2014 ${schedules.length} schedule${schedules.length > 1 ? "s" : ""} active
`));
  schedules.forEach((s) => info(`${s.name} \u2192 ${import_chalk.default.cyan(s.cronExpression)}`));
  console.log(import_chalk.default.gray("\n  Press Ctrl+C to stop.\n"));
  for (const schedule of schedules) {
    nodeCron.schedule(schedule.cronExpression, async () => {
      const ts = (/* @__PURE__ */ new Date()).toLocaleTimeString();
      console.log(import_chalk.default.cyan(`
  [${ts}] Running: ${schedule.name}`));
      try {
        const result = await executeFlow(schedule.flowId);
        db.updateScheduleLastRun(schedule.id, result.passed ? "passed" : "failed");
        console.log(result.passed ? import_chalk.default.green(`  \u2713 passed (${result.duration}ms)`) : import_chalk.default.red("  \u2717 failed"));
      } catch (err) {
        console.log(import_chalk.default.red(`  \u2717 error: ${err}`));
        db.updateScheduleLastRun(schedule.id, "failed");
      }
    });
  }
  process.on("SIGINT", () => {
    console.log("\n  Stopping...");
    db.close();
    process.exit(0);
  });
  await new Promise(() => {
  });
}
async function runStatus() {
  printLogo();
  divider();
  const flows = db.listFlows();
  const runs = db.listRuns(void 0, 100);
  const passed = runs.filter((r) => r.status === "passed").length;
  const failed = runs.filter((r) => r.status === "failed").length;
  console.log(import_chalk.default.bold("\n  Statistics\n"));
  console.log("  " + import_chalk.default.gray("Flows:        ") + import_chalk.default.white(String(flows.length)));
  console.log("  " + import_chalk.default.gray("Total Runs:   ") + import_chalk.default.white(String(runs.length)));
  console.log("  " + import_chalk.default.gray("Passed:       ") + import_chalk.default.green(String(passed)));
  console.log("  " + import_chalk.default.gray("Failed:       ") + import_chalk.default.red(String(failed)));
  if (runs.length > 0) {
    const rate = Math.round(passed / runs.length * 100);
    console.log("  " + import_chalk.default.gray("Success Rate: ") + (rate >= 80 ? import_chalk.default.green : rate >= 50 ? import_chalk.default.yellow : import_chalk.default.red)(`${rate}%`));
  }
  console.log();
  console.log("  " + import_chalk.default.gray("Data Path:    ") + import_chalk.default.white(DATA_PATH));
  const ollamaModel = await isOllamaRunning();
  if (ollamaModel) {
    console.log("  " + import_chalk.default.gray("AI Provider:  ") + import_chalk.default.green(`Ollama (${ollamaModel})`));
  } else if (process.env.ANTHROPIC_API_KEY) {
    console.log("  " + import_chalk.default.gray("AI Provider:  ") + import_chalk.default.cyan("Anthropic Claude"));
  } else {
    console.log("  " + import_chalk.default.gray("AI Provider:  ") + import_chalk.default.gray("none (run ollama locally or set ANTHROPIC_API_KEY)"));
  }
  console.log();
}
var args = process.argv.slice(2);
var cmd = args[0];
var db = new DatabaseManager();
async function main() {
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    printLogo();
    divider();
    console.log();
    console.log(import_chalk.default.bold("  Commands\n"));
    const C = (s) => import_chalk.default.cyan(s);
    const G = (s) => import_chalk.default.gray(s);
    const pad = 36;
    console.log(`  ${C("init").padEnd(pad)}${G("Initialize Flowmind")}`);
    console.log(`  ${C("learn <url> [name]").padEnd(pad)}${G("Record a flow (real browser)")}`);
    console.log(`  ${C("run <id|name>").padEnd(pad)}${G("Execute a flow")}`);
    console.log(`  ${C("flow:list").padEnd(pad)}${G("List all flows")}`);
    console.log(`  ${C("flow:fix <id|name>").padEnd(pad)}${G("Repair broken selectors interactively")}`);
    console.log(`  ${C("flow:delete <id|name>").padEnd(pad)}${G("Delete a flow")}`);
    console.log(`  ${C("flow:export <id|name>").padEnd(pad)}${G("Export flow to JSON")}`);
    console.log(`  ${C("flow:import <file>").padEnd(pad)}${G("Import flow from JSON")}`);
    console.log(`  ${C('flow:schedule <id> "<cron>"').padEnd(pad)}${G('Schedule a flow (e.g. "0 9 * * *")')}`);
    console.log(`  ${C("schedule:list").padEnd(pad)}${G("List all schedules")}`);
    console.log(`  ${C("schedule:remove <id>").padEnd(pad)}${G("Remove a schedule")}`);
    console.log(`  ${C("serve").padEnd(pad)}${G("Start scheduler daemon")}`);
    console.log(`  ${C("run:list").padEnd(pad)}${G("List recent runs")}`);
    console.log(`  ${C("run:show <id>").padEnd(pad)}${G("Show run details + screenshots")}`);
    console.log(`  ${C("run:diff <id1> <id2>").padEnd(pad)}${G("Visual screenshot diff between two runs")}`);
    console.log(`  ${C("run:analyze <id>").padEnd(pad)}${G("AI analysis of a failed run [AI]")}`);
    console.log(`  ${C("status").padEnd(pad)}${G("Statistics and AI provider info")}`);
    console.log();
    console.log(`  ${G("[AI] = enhanced by AI if available (Ollama local or Anthropic cloud)")}`);
    console.log();
    process.exit(0);
  }
  switch (cmd) {
    case "init":
      console.log(import_chalk.default.green("  \u2713 Initialized at " + DATA_PATH));
      break;
    case "learn":
      if (!args[1]) {
        errorMsg("URL required");
        process.exit(1);
      }
      await runLearn(args[1]);
      break;
    case "run":
      if (!args[1]) {
        errorMsg("Flow ID or name required");
        process.exit(1);
      }
      await runFlow(args[1]);
      break;
    case "flow:list":
      await runListFlows();
      break;
    case "flow:fix":
      if (!args[1]) {
        errorMsg("Flow ID or name required");
        process.exit(1);
      }
      await runFixFlow(args[1]);
      break;
    case "flow:delete":
      if (!args[1]) {
        errorMsg("Flow ID or name required");
        process.exit(1);
      }
      await runDeleteFlow(args[1]);
      break;
    case "flow:export":
      if (!args[1]) {
        errorMsg("Flow ID or name required");
        process.exit(1);
      }
      await runExportFlow(args[1]);
      break;
    case "flow:import":
      if (!args[1]) {
        errorMsg("File path required");
        process.exit(1);
      }
      await runImportFlow(args[1]);
      break;
    case "flow:schedule":
      if (!args[1] || !args[2]) {
        errorMsg('Usage: flow:schedule <id|name> "<cron expression>"');
        process.exit(1);
      }
      await runScheduleAdd(args[1], args[2]);
      break;
    case "schedule:list":
      await runScheduleList();
      break;
    case "schedule:remove":
      if (!args[1]) {
        errorMsg("Schedule ID required");
        process.exit(1);
      }
      await runScheduleRemove(args[1]);
      break;
    case "serve":
      await runServe();
      break;
    case "run:list":
      await runListRuns();
      break;
    case "run:show":
      if (!args[1]) {
        errorMsg("Run ID required");
        process.exit(1);
      }
      await runShowRun(args[1]);
      break;
    case "run:diff":
      if (!args[1] || !args[2]) {
        errorMsg("Usage: run:diff <run1-id> <run2-id>");
        process.exit(1);
      }
      await runDiff(args[1], args[2]);
      break;
    case "run:analyze":
      if (!args[1]) {
        errorMsg("Run ID required");
        process.exit(1);
      }
      await runAnalyzeRun(args[1]);
      break;
    case "status":
      await runStatus();
      break;
    default:
      errorMsg("Unknown command: " + cmd);
      console.log("  Run without args for help.");
      process.exit(1);
  }
  if (cmd !== "serve") db.close();
}
main().catch((err) => {
  errorMsg(String(err));
  process.exit(1);
});
