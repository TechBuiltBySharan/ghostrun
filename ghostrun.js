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

// ghostrun.ts
var import_playwright = require("playwright");
var import_chalk = __toESM(require("chalk"));
var fs2 = __toESM(require("fs"));
var path2 = __toESM(require("path"));
var readline = __toESM(require("readline"));
var import_uuid2 = require("uuid");

// packages/database/src/manager.ts
var fs = __toESM(require("fs"), 1);
var path = __toESM(require("path"), 1);
var import_better_sqlite3 = __toESM(require("better-sqlite3"), 1);
var import_uuid = require("uuid");
var HOME_DIR = process.env.HOME || process.env.USERPROFILE || ".";
var DATA_PATH = path.join(HOME_DIR, ".ghostrun");
var DB_PATH = path.join(DATA_PATH, "data", "ghostrun.db");
var DatabaseManager = class _DatabaseManager {
  db;
  constructor() {
    fs.mkdirSync(path.join(DATA_PATH, "data"), { recursive: true });
    fs.mkdirSync(path.join(DATA_PATH, "screenshots"), { recursive: true });
    fs.mkdirSync(path.join(DATA_PATH, "sessions"), { recursive: true });
    this.db = new import_better_sqlite3.default(DB_PATH);
    this.initialize();
    this.runMigrations();
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
      CREATE TABLE IF NOT EXISTS suites (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS suite_flows (
        id TEXT PRIMARY KEY, suite_id TEXT NOT NULL, flow_id TEXT NOT NULL,
        order_index INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (suite_id) REFERENCES suites(id) ON DELETE CASCADE,
        FOREIGN KEY (flow_id) REFERENCES flows(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS baselines (
        id TEXT PRIMARY KEY, flow_id TEXT NOT NULL, step_number INTEGER NOT NULL,
        screenshot_path TEXT NOT NULL, captured_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(flow_id, step_number)
      );
      CREATE TABLE IF NOT EXISTS explore_reports (
        id TEXT PRIMARY KEY, url TEXT NOT NULL, environment TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        report_path TEXT
      );
      CREATE TABLE IF NOT EXISTS explore_candidates (
        id TEXT PRIMARY KEY, report_id TEXT NOT NULL,
        name TEXT NOT NULL, description TEXT, route TEXT NOT NULL,
        screenshot_path TEXT, graph TEXT NOT NULL DEFAULT '{}',
        confirmed INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (report_id) REFERENCES explore_reports(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS run_data (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        variable_name TEXT NOT NULL,
        variable_value TEXT NOT NULL,
        step_number INTEGER NOT NULL,
        UNIQUE(run_id, variable_name),
        FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS environments (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        base_url TEXT,
        variables TEXT NOT NULL DEFAULT '{}',
        is_active INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS api_responses (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        step_number INTEGER NOT NULL,
        method TEXT NOT NULL,
        url TEXT NOT NULL,
        status_code INTEGER,
        response_time_ms INTEGER,
        response_headers TEXT,
        response_body TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS perf_runs (
        id TEXT PRIMARY KEY,
        flow_id TEXT NOT NULL,
        flow_name TEXT NOT NULL,
        config TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',
        total_requests INTEGER,
        success_requests INTEGER,
        failed_requests INTEGER,
        avg_rps REAL,
        p50_ms INTEGER,
        p95_ms INTEGER,
        p99_ms INTEGER,
        min_ms INTEGER,
        max_ms INTEGER,
        per_step_stats TEXT,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT,
        FOREIGN KEY (flow_id) REFERENCES flows(id) ON DELETE CASCADE
      );
    `);
  }
  // ---- Flows ----
  createFlow(data) {
    const id = (0, import_uuid.v4)();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const createdBy = data.createdBy || "human";
    this.db.prepare(`INSERT INTO flows (id, name, description, app_url, graph, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, data.name, data.description || null, data.appUrl || null, JSON.stringify(data.graph || {}), now, now, createdBy);
    return this.getFlow(id);
  }
  verifyFlow(id) {
    this.db.prepare("UPDATE flows SET verified = 1 WHERE id = ?").run(id);
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
      updatedAt: new Date(r.updated_at),
      createdBy: r.created_by || "human",
      verified: Boolean(r.verified)
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
    if (data.diffPercent !== void 0) {
      updates.push("diff_percent = ?");
      values.push(data.diffPercent);
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
      screenshotPath: r.screenshot_path,
      diffPercent: r.diff_percent
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
  // ---- DB migrations ----
  //
  // Uses SQLite's built-in PRAGMA user_version as a schema version counter.
  // Each migration runs exactly once: we read the current version, apply every
  // migration whose index is >= that version (in order), then write the new version.
  //
  // HOW TO ADD A NEW MIGRATION:
  //   1. Append a new string to the MIGRATIONS array below.
  //   2. That's it. The runner handles the rest.
  //
  // Never edit or reorder existing entries — just append.
  static MIGRATIONS = [
    // v1: add diff_percent to steps
    "ALTER TABLE steps ADD COLUMN diff_percent REAL",
    // v2: add created_by to flows
    "ALTER TABLE flows ADD COLUMN created_by TEXT NOT NULL DEFAULT 'human'",
    // v3: add verified flag to flows
    "ALTER TABLE flows ADD COLUMN verified INTEGER NOT NULL DEFAULT 0",
    // v4: add captured_at to run_data
    "ALTER TABLE run_data ADD COLUMN captured_at TEXT DEFAULT (datetime('now'))",
    // v5: environments table
    `CREATE TABLE IF NOT EXISTS environments (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, base_url TEXT,
      variables TEXT NOT NULL DEFAULT '{}', is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    // v6: api_responses table
    `CREATE TABLE IF NOT EXISTS api_responses (
      id TEXT PRIMARY KEY, run_id TEXT NOT NULL, step_number INTEGER NOT NULL,
      method TEXT NOT NULL, url TEXT NOT NULL, status_code INTEGER,
      response_time_ms INTEGER, response_headers TEXT, response_body TEXT,
      error_message TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    // v7: perf_runs table
    `CREATE TABLE IF NOT EXISTS perf_runs (
      id TEXT PRIMARY KEY, flow_id TEXT NOT NULL, flow_name TEXT NOT NULL,
      config TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'running',
      total_requests INTEGER, success_requests INTEGER, failed_requests INTEGER,
      avg_rps REAL, p50_ms INTEGER, p95_ms INTEGER, p99_ms INTEGER,
      min_ms INTEGER, max_ms INTEGER, per_step_stats TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')), completed_at TEXT
    )`
    // --- add new migrations below this line ---
  ];
  // Number of migrations that existed before we introduced versioning.
  // Existing databases have these applied already (via old try/catch approach)
  // but their user_version is 0. We detect this and fast-forward rather than
  // re-running them (which would throw "duplicate column" errors).
  static LEGACY_MIGRATION_COUNT = 7;
  columnExists(table, column) {
    const cols = this.db.pragma(`table_info(${table})`);
    return cols.some((c) => c.name === column);
  }
  runMigrations() {
    let currentVersion = this.db.pragma("user_version", { simple: true }) ?? 0;
    if (currentVersion === 0 && this.columnExists("steps", "diff_percent")) {
      currentVersion = _DatabaseManager.LEGACY_MIGRATION_COUNT;
      this.db.pragma(`user_version = ${currentVersion}`);
    }
    if (currentVersion >= _DatabaseManager.MIGRATIONS.length) return;
    const applyAll = this.db.transaction(() => {
      for (let i = currentVersion; i < _DatabaseManager.MIGRATIONS.length; i++) {
        this.db.exec(_DatabaseManager.MIGRATIONS[i]);
      }
      this.db.pragma(`user_version = ${_DatabaseManager.MIGRATIONS.length}`);
    });
    applyAll();
  }
  // ---- Suites ----
  createSuite(data) {
    const id = (0, import_uuid.v4)();
    this.db.prepare(`INSERT INTO suites (id, name, description) VALUES (?, ?, ?)`).run(id, data.name, data.description || null);
    return this.getSuite(id);
  }
  getSuite(id) {
    const r = this.db.prepare("SELECT * FROM suites WHERE id = ?").get(id);
    return r ? { id: r.id, name: r.name, description: r.description, createdAt: new Date(r.created_at) } : null;
  }
  findSuiteByNameOrId(q) {
    const byId = this.db.prepare("SELECT * FROM suites WHERE id LIKE ?").all(q + "%");
    if (byId.length === 1) return this.getSuite(byId[0].id);
    const byName = this.db.prepare("SELECT * FROM suites WHERE LOWER(name) LIKE ?").all(`%${q.toLowerCase()}%`);
    if (byName.length === 1) return this.getSuite(byName[0].id);
    if (byName.length > 1) return this.getSuite(byName[0].id);
    return null;
  }
  listSuites() {
    return this.db.prepare("SELECT * FROM suites ORDER BY created_at DESC").all().map((r) => ({ id: r.id, name: r.name, description: r.description, createdAt: new Date(r.created_at) }));
  }
  deleteSuite(id) {
    return this.db.prepare("DELETE FROM suites WHERE id = ?").run(id).changes > 0;
  }
  addFlowToSuite(suiteId, flowId) {
    const count = this.db.prepare("SELECT COUNT(*) as c FROM suite_flows WHERE suite_id = ?").get(suiteId).c;
    const id = (0, import_uuid.v4)();
    this.db.prepare(`INSERT INTO suite_flows (id, suite_id, flow_id, order_index) VALUES (?, ?, ?, ?)`).run(id, suiteId, flowId, count);
  }
  removeFlowFromSuite(suiteId, flowId) {
    this.db.prepare("DELETE FROM suite_flows WHERE suite_id = ? AND flow_id = ?").run(suiteId, flowId);
  }
  getSuiteFlows(suiteId) {
    return this.db.prepare("SELECT sf.*, f.name as flow_name FROM suite_flows sf JOIN flows f ON sf.flow_id = f.id WHERE sf.suite_id = ? ORDER BY sf.order_index").all(suiteId).map((r) => ({ id: r.id, suiteId: r.suite_id, flowId: r.flow_id, flowName: r.flow_name, orderIndex: r.order_index }));
  }
  // ---- Baselines ----
  setBaseline(flowId, stepNumber, screenshotPath) {
    const existing = this.db.prepare("SELECT id FROM baselines WHERE flow_id = ? AND step_number = ?").get(flowId, stepNumber);
    if (existing) {
      this.db.prepare("UPDATE baselines SET screenshot_path = ?, captured_at = datetime('now') WHERE id = ?").run(screenshotPath, existing.id);
    } else {
      this.db.prepare("INSERT INTO baselines (id, flow_id, step_number, screenshot_path) VALUES (?, ?, ?, ?)").run((0, import_uuid.v4)(), flowId, stepNumber, screenshotPath);
    }
  }
  getBaseline(flowId, stepNumber) {
    return this.db.prepare("SELECT * FROM baselines WHERE flow_id = ? AND step_number = ?").get(flowId, stepNumber);
  }
  clearBaselines(flowId) {
    this.db.prepare("DELETE FROM baselines WHERE flow_id = ?").run(flowId);
  }
  listBaselines(flowId) {
    return this.db.prepare("SELECT * FROM baselines WHERE flow_id = ? ORDER BY step_number").all(flowId).map((r) => ({ stepNumber: r.step_number, screenshotPath: r.screenshot_path, capturedAt: new Date(r.captured_at) }));
  }
  // ---- Explore Reports ----
  createExploreReport(url, environment) {
    const id = (0, import_uuid.v4)();
    this.db.prepare(`INSERT INTO explore_reports (id, url, environment, status) VALUES (?, ?, ?, 'pending')`).run(id, url, environment);
    return this.getExploreReport(id);
  }
  getExploreReport(id) {
    const r = this.db.prepare("SELECT * FROM explore_reports WHERE id = ?").get(id);
    return r ? { id: r.id, url: r.url, environment: r.environment, status: r.status, reportPath: r.report_path } : null;
  }
  listExploreReports() {
    return this.db.prepare("SELECT * FROM explore_reports ORDER BY rowid DESC LIMIT 20").all().map((r) => ({ id: r.id, url: r.url, status: r.status, reportPath: r.report_path, createdAt: r.created_at }));
  }
  findExploreReportByPartialId(q) {
    const rows = this.db.prepare("SELECT * FROM explore_reports WHERE id LIKE ?").all(q + "%");
    if (rows.length !== 1) return null;
    const r = rows[0];
    return { id: r.id, url: r.url, environment: r.environment, status: r.status, reportPath: r.report_path };
  }
  updateExploreReport(id, data) {
    const updates = [];
    const values = [];
    if (data.status) {
      updates.push("status = ?");
      values.push(data.status);
    }
    if (data.reportPath) {
      updates.push("report_path = ?");
      values.push(data.reportPath);
    }
    values.push(id);
    if (updates.length > 0) this.db.prepare(`UPDATE explore_reports SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  }
  createExploreCandidate(data) {
    const id = (0, import_uuid.v4)();
    this.db.prepare(`INSERT INTO explore_candidates (id, report_id, name, description, route, screenshot_path, graph) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, data.reportId, data.name, data.description, data.route, data.screenshotPath || null, JSON.stringify(data.graph));
    return id;
  }
  listExploreCandidates(reportId) {
    return this.db.prepare("SELECT * FROM explore_candidates WHERE report_id = ? ORDER BY rowid").all(reportId).map((r) => ({ id: r.id, reportId: r.report_id, name: r.name, description: r.description, route: r.route, screenshotPath: r.screenshot_path, graph: r.graph, confirmed: Boolean(r.confirmed) }));
  }
  confirmExploreCandidate(id) {
    this.db.prepare("UPDATE explore_candidates SET confirmed = 1 WHERE id = ?").run(id);
  }
  close() {
    this.db.close();
  }
  // ---- Run Data (extracted variables) ----
  saveRunData(runId, stepNumber, variableName, value) {
    const id = (0, import_uuid.v4)();
    this.db.prepare("INSERT OR REPLACE INTO run_data (id, run_id, step_number, variable_name, variable_value) VALUES (?,?,?,?,?)").run(id, runId, stepNumber, variableName, value);
  }
  getRunData(runId) {
    return this.db.prepare("SELECT * FROM run_data WHERE run_id = ? ORDER BY step_number").all(runId).map((r) => ({ variableName: r.variable_name, variableValue: r.variable_value, stepNumber: r.step_number }));
  }
  // ---- Flow Stats ----
  getFlowStats(flowId) {
    const r = this.db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status='passed' THEN 1 ELSE 0 END) as passed, MAX(started_at) as last_run_at FROM runs WHERE flow_id = ?").get(flowId);
    const last = this.db.prepare("SELECT status FROM runs WHERE flow_id = ? ORDER BY started_at DESC LIMIT 1").get(flowId);
    return {
      totalRuns: r?.total || 0,
      passRate: r?.total > 0 ? (r.passed || 0) / r.total : 0,
      lastRunStatus: last?.status || null,
      lastRunAt: r?.last_run_at || null
    };
  }
  // ---- Environments ----
  createEnvironment(data) {
    const id = (0, import_uuid.v4)();
    this.db.prepare(`INSERT INTO environments (id, name, base_url, variables) VALUES (?, ?, ?, ?)`).run(id, data.name, data.baseUrl || null, JSON.stringify(data.variables || {}));
    return this.getEnvironment(id);
  }
  getEnvironment(id) {
    const r = this.db.prepare("SELECT * FROM environments WHERE id = ?").get(id);
    return r ? this.mapEnvironment(r) : null;
  }
  findEnvironmentByName(name) {
    const r = this.db.prepare("SELECT * FROM environments WHERE LOWER(name) = ?").get(name.toLowerCase());
    return r ? this.mapEnvironment(r) : null;
  }
  listEnvironments() {
    return this.db.prepare("SELECT * FROM environments ORDER BY name").all().map((r) => this.mapEnvironment(r));
  }
  updateEnvironment(id, data) {
    const updates = [];
    const values = [];
    if (data.name !== void 0) {
      updates.push("name = ?");
      values.push(data.name);
    }
    if (data.baseUrl !== void 0) {
      updates.push("base_url = ?");
      values.push(data.baseUrl);
    }
    if (data.variables !== void 0) {
      updates.push("variables = ?");
      values.push(JSON.stringify(data.variables));
    }
    values.push(id);
    if (updates.length > 0) this.db.prepare(`UPDATE environments SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    return this.getEnvironment(id);
  }
  deleteEnvironment(id) {
    return this.db.prepare("DELETE FROM environments WHERE id = ?").run(id).changes > 0;
  }
  setActiveEnvironment(id) {
    this.db.prepare("UPDATE environments SET is_active = 0").run();
    this.db.prepare("UPDATE environments SET is_active = 1 WHERE id = ?").run(id);
  }
  getActiveEnvironment() {
    const r = this.db.prepare("SELECT * FROM environments WHERE is_active = 1 LIMIT 1").get();
    return r ? this.mapEnvironment(r) : null;
  }
  mapEnvironment(r) {
    return {
      id: r.id,
      name: r.name,
      baseUrl: r.base_url,
      variables: JSON.parse(r.variables || "{}"),
      isActive: Boolean(r.is_active),
      createdAt: new Date(r.created_at)
    };
  }
  // ---- API Responses ----
  saveApiResponse(data) {
    const id = (0, import_uuid.v4)();
    this.db.prepare(`INSERT INTO api_responses (id, run_id, step_number, method, url, status_code, response_time_ms, response_headers, response_body, error_message) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      id,
      data.runId,
      data.stepNumber,
      data.method,
      data.url,
      data.statusCode ?? null,
      data.responseTimeMs ?? null,
      data.responseHeaders ? JSON.stringify(data.responseHeaders) : null,
      data.responseBody ?? null,
      data.errorMessage ?? null
    );
    return id;
  }
  getApiResponses(runId) {
    return this.db.prepare("SELECT * FROM api_responses WHERE run_id = ? ORDER BY step_number").all(runId).map((r) => ({
      id: r.id,
      runId: r.run_id,
      stepNumber: r.step_number,
      method: r.method,
      url: r.url,
      statusCode: r.status_code,
      responseTimeMs: r.response_time_ms,
      responseHeaders: r.response_headers ? JSON.parse(r.response_headers) : null,
      responseBody: r.response_body,
      errorMessage: r.error_message
    }));
  }
  // ---- Perf Runs ----
  createPerfRun(data) {
    const id = (0, import_uuid.v4)();
    this.db.prepare(`INSERT INTO perf_runs (id, flow_id, flow_name, config, status) VALUES (?, ?, ?, ?, 'running')`).run(id, data.flowId, data.flowName, JSON.stringify(data.config));
    return id;
  }
  updatePerfRun(id, data) {
    const updates = [];
    const values = [];
    if (data.status !== void 0) {
      updates.push("status = ?");
      values.push(data.status);
    }
    if (data.totalRequests !== void 0) {
      updates.push("total_requests = ?");
      values.push(data.totalRequests);
    }
    if (data.successRequests !== void 0) {
      updates.push("success_requests = ?");
      values.push(data.successRequests);
    }
    if (data.failedRequests !== void 0) {
      updates.push("failed_requests = ?");
      values.push(data.failedRequests);
    }
    if (data.avgRps !== void 0) {
      updates.push("avg_rps = ?");
      values.push(data.avgRps);
    }
    if (data.p50 !== void 0) {
      updates.push("p50_ms = ?");
      values.push(data.p50);
    }
    if (data.p95 !== void 0) {
      updates.push("p95_ms = ?");
      values.push(data.p95);
    }
    if (data.p99 !== void 0) {
      updates.push("p99_ms = ?");
      values.push(data.p99);
    }
    if (data.minMs !== void 0) {
      updates.push("min_ms = ?");
      values.push(data.minMs);
    }
    if (data.maxMs !== void 0) {
      updates.push("max_ms = ?");
      values.push(data.maxMs);
    }
    if (data.perStepStats !== void 0) {
      updates.push("per_step_stats = ?");
      values.push(JSON.stringify(data.perStepStats));
    }
    if (data.status === "done" || data.status === "failed") {
      updates.push("completed_at = datetime('now')");
    }
    values.push(id);
    if (updates.length > 0) this.db.prepare(`UPDATE perf_runs SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  }
  getPerfRun(id) {
    const r = this.db.prepare("SELECT * FROM perf_runs WHERE id = ?").get(id);
    return r ? this.mapPerfRun(r) : null;
  }
  findPerfRunByPartialId(q) {
    const rows = this.db.prepare("SELECT * FROM perf_runs WHERE id LIKE ?").all(q + "%");
    return rows.length >= 1 ? this.mapPerfRun(rows[0]) : null;
  }
  listPerfRuns(limit = 20) {
    return this.db.prepare("SELECT * FROM perf_runs ORDER BY started_at DESC LIMIT ?").all(limit).map((r) => this.mapPerfRun(r));
  }
  mapPerfRun(r) {
    return {
      id: r.id,
      flowId: r.flow_id,
      flowName: r.flow_name,
      config: JSON.parse(r.config),
      status: r.status,
      totalRequests: r.total_requests,
      successRequests: r.success_requests,
      failedRequests: r.failed_requests,
      avgRps: r.avg_rps,
      p50: r.p50_ms,
      p95: r.p95_ms,
      p99: r.p99_ms,
      minMs: r.min_ms,
      maxMs: r.max_ms,
      perStepStats: r.per_step_stats ? JSON.parse(r.per_step_stats) : null,
      startedAt: new Date(r.started_at),
      completedAt: r.completed_at ? new Date(r.completed_at) : null
    };
  }
};

// ghostrun.ts
var HOME_DIR2 = process.env.HOME || process.env.USERPROFILE || ".";
var DATA_PATH2 = path2.join(HOME_DIR2, ".ghostrun");
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
function resolveVarsDeep(value, ctx) {
  if (typeof value === "string") {
    return value.replace(/\{\{(\w+)\}\}/g, (_, k) => ctx.variables[k] ?? "");
  }
  if (Array.isArray(value)) return value.map((v) => resolveVarsDeep(v, ctx));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveVarsDeep(v, ctx);
    return out;
  }
  return value;
}
function getJsonPath(obj, path3) {
  const parts = path3.replace(/^\$\.?/, "").split(/\.|\[(\d+)\]/).filter((p) => p !== void 0 && p !== "");
  let cur = obj;
  for (const part of parts) {
    if (cur === null || cur === void 0) return void 0;
    if (typeof cur === "object") cur = cur[part];
    else return void 0;
  }
  return cur;
}
async function executeHttpRequest(node, ctx, runId, stepNumber) {
  const method = (node.method || "GET").toUpperCase();
  const url = resolveVarsDeep(node.url, ctx);
  if (!url) throw new Error("http:request requires a url");
  const rawHeaders = node.headers || {};
  const headers = {};
  for (const [k, v] of Object.entries(rawHeaders)) {
    headers[k] = resolveVarsDeep(v, ctx);
  }
  const auth = node.auth;
  if (auth?.type === "bearer" && auth.token) {
    headers["Authorization"] = `Bearer ${resolveVarsDeep(auth.token, ctx)}`;
  } else if (auth?.type === "basic" && auth.username) {
    const creds = Buffer.from(`${resolveVarsDeep(auth.username, ctx)}:${resolveVarsDeep(auth.password || "", ctx)}`).toString("base64");
    headers["Authorization"] = `Basic ${creds}`;
  } else if (auth?.type === "apikey" && auth.key) {
    const headerName = auth.header || "X-API-Key";
    headers[headerName] = resolveVarsDeep(auth.key, ctx);
  }
  let body;
  if (node.body && ["POST", "PUT", "PATCH"].includes(method)) {
    const resolvedBody = resolveVarsDeep(node.body, ctx);
    body = typeof resolvedBody === "string" ? resolvedBody : JSON.stringify(resolvedBody);
    if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
  }
  const start = Date.now();
  let response;
  try {
    response = await fetch(url, { method, headers, body });
  } catch (e) {
    db.saveApiResponse({ runId, stepNumber, method, url, errorMessage: String(e) });
    throw new Error(`HTTP request failed: ${e}`);
  }
  const responseTimeMs = Date.now() - start;
  const responseHeaders = {};
  response.headers.forEach((v, k) => {
    responseHeaders[k] = v;
  });
  let bodyText = "";
  let bodyJson = null;
  try {
    bodyText = await response.text();
  } catch {
  }
  try {
    bodyJson = JSON.parse(bodyText);
  } catch {
  }
  ctx.lastResponse = {
    status: response.status,
    headers: responseHeaders,
    body: bodyJson ?? bodyText,
    bodyText,
    responseTimeMs,
    url,
    method
  };
  db.saveApiResponse({
    runId,
    stepNumber,
    method,
    url,
    statusCode: response.status,
    responseTimeMs,
    responseHeaders,
    responseBody: bodyText.slice(0, 1e4)
  });
  const extract = node.extract;
  if (extract && bodyJson) {
    for (const [varName, jsonPath] of Object.entries(extract)) {
      const val = getJsonPath(bodyJson, jsonPath);
      if (val !== void 0) {
        ctx.variables[varName] = String(val);
        db.saveRunData(runId, stepNumber, varName, String(val));
      }
    }
  }
}
async function executeApiAssert(node, ctx) {
  const lastResp = ctx.lastResponse;
  if (!lastResp) throw new Error("assert:response \u2014 no HTTP response in context (run http:request first)");
  const assertType = node.assert || "status";
  const expected = node.expected !== void 0 ? resolveVarsDeep(node.expected, ctx) : void 0;
  switch (assertType) {
    case "status": {
      const exp = Number(expected ?? 200);
      if (lastResp.status !== exp) {
        throw new Error(`Expected status ${exp}, got ${lastResp.status} \u2014 ${lastResp.url}`);
      }
      break;
    }
    case "status:range": {
      const min = Number(node.min ?? 200), max = Number(node.max ?? 299);
      if (lastResp.status < min || lastResp.status > max) {
        throw new Error(`Status ${lastResp.status} outside range [${min}-${max}]`);
      }
      break;
    }
    case "body:contains": {
      const needle = String(expected ?? "");
      if (!lastResp.bodyText.includes(needle)) {
        throw new Error(`Response body does not contain "${needle}"`);
      }
      break;
    }
    case "body:equals": {
      const expStr = typeof expected === "object" ? JSON.stringify(expected) : String(expected ?? "");
      const gotStr = typeof lastResp.body === "object" ? JSON.stringify(lastResp.body) : lastResp.bodyText;
      if (gotStr !== expStr) {
        throw new Error(`Response body mismatch.
Expected: ${expStr.slice(0, 200)}
Got:      ${gotStr.slice(0, 200)}`);
      }
      break;
    }
    case "json:path": {
      const jpath = node.path || "";
      const val = getJsonPath(lastResp.body, jpath);
      const exp = resolveVarsDeep(node.expected, ctx);
      if (String(val) !== String(exp)) {
        throw new Error(`JSON path "${jpath}": expected "${exp}", got "${val}"`);
      }
      break;
    }
    case "json:exists": {
      const jpath = node.path || "";
      const val = getJsonPath(lastResp.body, jpath);
      if (val === void 0 || val === null) {
        throw new Error(`JSON path "${jpath}" does not exist in response`);
      }
      break;
    }
    case "header": {
      const headerName = (node.header || "").toLowerCase();
      const headerVal = lastResp.headers[headerName];
      if (expected !== void 0 && String(headerVal) !== String(expected)) {
        throw new Error(`Header "${headerName}": expected "${expected}", got "${headerVal}"`);
      } else if (!headerVal) {
        throw new Error(`Header "${headerName}" not present in response`);
      }
      break;
    }
    case "time": {
      const maxMs = Number(expected ?? 2e3);
      if (lastResp.responseTimeMs > maxMs) {
        throw new Error(`Response took ${lastResp.responseTimeMs}ms, expected < ${maxMs}ms`);
      }
      break;
    }
    default:
      throw new Error(`Unknown assert type: "${assertType}"`);
  }
}
function executeSetVariable(node, ctx, runId, stepNumber) {
  const varName = node.variable;
  const value = resolveVarsDeep(node.value, ctx);
  if (!varName) throw new Error("set:variable requires a variable name");
  ctx.variables[varName] = String(value ?? "");
  db.saveRunData(runId, stepNumber, varName, String(value ?? ""));
}
function executeExtractJson(node, ctx, runId, stepNumber) {
  const varName = node.variable;
  const jsonPath = node.path;
  if (!varName || !jsonPath) throw new Error("extract:json requires variable and path");
  if (!ctx.lastResponse) throw new Error("extract:json \u2014 no HTTP response in context");
  const val = getJsonPath(ctx.lastResponse.body, jsonPath);
  if (val === void 0) throw new Error(`JSON path "${jsonPath}" not found in response`);
  ctx.variables[varName] = String(val);
  db.saveRunData(runId, stepNumber, varName, String(val));
}
function calcPercentile(sortedMs, pct) {
  if (!sortedMs.length) return 0;
  const idx = Math.ceil(pct / 100 * sortedMs.length) - 1;
  return sortedMs[Math.max(0, Math.min(idx, sortedMs.length - 1))];
}
function calcStats(samples, durationMs) {
  const httpSamples = samples.filter((s) => s.isHttp);
  const total = httpSamples.length;
  const success2 = httpSamples.filter((s) => s.success).length;
  const failed = total - success2;
  const durations = httpSamples.map((s) => s.duration).sort((a, b) => a - b);
  return {
    total,
    success: success2,
    failed,
    errorRate: total > 0 ? parseFloat((failed / total * 100).toFixed(1)) : 0,
    avgRps: parseFloat((total / (durationMs / 1e3)).toFixed(1)),
    p50: calcPercentile(durations, 50),
    p95: calcPercentile(durations, 95),
    p99: calcPercentile(durations, 99),
    min: durations[0] ?? 0,
    max: durations[durations.length - 1] ?? 0
  };
}
async function runApiStepDirect(node, action, ctx, timeoutMs) {
  const API_ONLY_ACTIONS = /* @__PURE__ */ new Set([
    "http:request",
    "assert:response",
    "assert:status",
    "assert:body",
    "assert:header",
    "assert:time",
    "set:variable",
    "extract:json",
    "env:switch"
  ]);
  if (!API_ONLY_ACTIONS.has(action)) return;
  if (action === "http:request") {
    const method = (node.method || "GET").toUpperCase();
    const url = resolveVarsDeep(node.url, ctx);
    const rawHeaders = node.headers || {};
    const headers = {};
    for (const [k, v] of Object.entries(rawHeaders)) headers[k] = resolveVarsDeep(v, ctx);
    const auth = node.auth;
    if (auth?.type === "bearer" && auth.token) {
      headers["Authorization"] = `Bearer ${resolveVarsDeep(auth.token, ctx)}`;
    } else if (auth?.type === "basic" && auth.username) {
      const creds = Buffer.from(`${resolveVarsDeep(auth.username, ctx)}:${resolveVarsDeep(auth.password || "", ctx)}`).toString("base64");
      headers["Authorization"] = `Basic ${creds}`;
    } else if (auth?.type === "apikey" && auth.key) {
      headers[auth.header || "X-API-Key"] = resolveVarsDeep(auth.key, ctx);
    }
    let body;
    if (node.body && ["POST", "PUT", "PATCH"].includes(method)) {
      const resolved = resolveVarsDeep(node.body, ctx);
      body = typeof resolved === "string" ? resolved : JSON.stringify(resolved);
      if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const t = Date.now();
    let response;
    try {
      response = await fetch(url, { method, headers, body, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    const responseTimeMs = Date.now() - t;
    let bodyText = "";
    let bodyJson = null;
    try {
      bodyText = await response.text();
    } catch {
    }
    try {
      bodyJson = JSON.parse(bodyText);
    } catch {
    }
    ctx.lastResponse = {
      status: response.status,
      headers: {},
      body: bodyJson ?? bodyText,
      bodyText,
      responseTimeMs,
      url,
      method
    };
    const extract = node.extract;
    if (extract && bodyJson) {
      for (const [varName, jp] of Object.entries(extract)) {
        const val = getJsonPath(bodyJson, jp);
        if (val !== void 0) ctx.variables[varName] = String(val);
      }
    }
  } else if (action.startsWith("assert:")) {
    await executeApiAssert(node, ctx);
  } else if (action === "set:variable") {
    const varName = node.variable;
    if (varName) ctx.variables[varName] = String(resolveVarsDeep(node.value, ctx) ?? "");
  } else if (action === "extract:json") {
    const varName = node.variable;
    const jp = node.path;
    if (varName && jp && ctx.lastResponse) {
      const val = getJsonPath(ctx.lastResponse.body, jp);
      if (val !== void 0) ctx.variables[varName] = String(val);
    }
  }
}
async function runVU(vuId, actionNodes, baseVars, endTime, samples, timeoutMs) {
  while (Date.now() < endTime) {
    const ctx = { variables: { ...baseVars } };
    for (const node of actionNodes) {
      if (Date.now() >= endTime) return;
      const action = node.action;
      const label = node.label || action;
      const t = Date.now();
      try {
        const resolvedNode = {
          ...node,
          url: node.url ? resolveVarsDeep(node.url, ctx) : node.url,
          value: node.value ? resolveVarsDeep(node.value, ctx) : node.value
        };
        await runApiStepDirect(resolvedNode, action, ctx, timeoutMs);
        const isHttp = action === "http:request";
        const httpSuccess = isHttp ? (ctx.lastResponse?.status ?? 0) < 400 : true;
        samples.push({ label, duration: Date.now() - t, success: httpSuccess, vuId, isHttp });
      } catch {
        const isHttp = action === "http:request";
        samples.push({ label, duration: Date.now() - t, success: false, vuId, isHttp });
        break;
      }
    }
  }
}
async function runPerfTest(flowId, config) {
  const flow = db.findFlowByPartialId(flowId) || db.findFlowByName(flowId);
  if (!flow) throw new Error("Flow not found: " + flowId);
  const graph = JSON.parse(flow.graph);
  const API_ONLY = /* @__PURE__ */ new Set([
    "http:request",
    "assert:response",
    "assert:status",
    "assert:body",
    "assert:header",
    "assert:time",
    "set:variable",
    "extract:json",
    "env:switch"
  ]);
  const actionNodes = (graph.nodes || []).filter((n) => n.type === "action");
  const apiNodes = actionNodes.filter((n) => API_ONLY.has(n.action));
  if (!apiNodes.length) throw new Error("No API steps found in this flow. perf:run only supports API flows.");
  const baseVars = {};
  const activeEnv = db.getActiveEnvironment();
  if (activeEnv) Object.assign(baseVars, activeEnv.variables);
  const perfRunId = db.createPerfRun({ flowId: flow.id, flowName: flow.name, config });
  const samples = [];
  const testStart = Date.now();
  const endTime = testStart + config.duration;
  const vuPromises = [];
  const rampDelay = config.vus > 1 ? config.rampUp / (config.vus - 1) : 0;
  for (let i = 0; i < config.vus; i++) {
    const delay = Math.round(i * rampDelay);
    vuPromises.push(
      new Promise((resolve) => setTimeout(resolve, delay)).then(
        () => runVU(i, apiNodes, baseVars, endTime, samples, config.timeout)
      )
    );
  }
  await Promise.all(vuPromises);
  const actualDuration = Date.now() - testStart;
  const stats = calcStats(samples, actualDuration);
  const perStep = {};
  const stepLabels = [...new Set(samples.map((s) => s.label))];
  for (const label of stepLabels) {
    const stepSamples = samples.filter((s) => s.label === label);
    const isHttpStep = stepSamples.some((s) => s.isHttp);
    if (isHttpStep) {
      perStep[label] = calcStats(stepSamples, actualDuration);
    } else {
      const total = stepSamples.length;
      const success2 = stepSamples.filter((s) => s.success).length;
      const failed = total - success2;
      const durations = stepSamples.map((s) => s.duration).sort((a, b) => a - b);
      perStep[label] = {
        total,
        success: success2,
        failed,
        errorRate: total > 0 ? parseFloat((failed / total * 100).toFixed(1)) : 0,
        avgRps: parseFloat((total / (actualDuration / 1e3)).toFixed(1)),
        p50: calcPercentile(durations, 50),
        p95: calcPercentile(durations, 95),
        p99: calcPercentile(durations, 99),
        min: durations[0] ?? 0,
        max: durations[durations.length - 1] ?? 0
      };
    }
  }
  db.updatePerfRun(perfRunId, {
    status: "done",
    totalRequests: stats.total,
    successRequests: stats.success,
    failedRequests: stats.failed,
    avgRps: stats.avgRps,
    p50: stats.p50,
    p95: stats.p95,
    p99: stats.p99,
    minMs: stats.min,
    maxMs: stats.max,
    perStepStats: perStep
  });
  const checkSamples = samples.filter((s) => !s.isHttp);
  const checksTotal = checkSamples.length;
  const checksFailed = checkSamples.filter((s) => !s.success).length;
  return { stats, checksTotal, checksFailed, perStep, perfRunId };
}
function generateK6Script(flowName, actionNodes, config) {
  const lines = [];
  const durationSec = Math.round(config.duration / 1e3);
  lines.push(`import http from 'k6/http';`);
  lines.push(`import { check, sleep } from 'k6';`);
  lines.push(`import { Trend } from 'k6/metrics';`);
  lines.push(``);
  lines.push(`// Generated by GhostRun from flow: "${flowName}"`);
  lines.push(`// Run with: k6 run <this-file>`);
  lines.push(``);
  lines.push(`export const options = {`);
  lines.push(`  stages: [`);
  lines.push(`    { duration: '${Math.max(5, Math.round(durationSec * 0.2))}s', target: ${config.vus} },`);
  lines.push(`    { duration: '${Math.max(10, Math.round(durationSec * 0.6))}s', target: ${config.vus} },`);
  lines.push(`    { duration: '${Math.max(5, Math.round(durationSec * 0.2))}s', target: 0 },`);
  lines.push(`  ],`);
  lines.push(`  thresholds: {`);
  lines.push(`    http_req_duration: ['p(95)<${config.p95threshold}'],`);
  lines.push(`    http_req_failed: ['rate<${(config.errorThreshold / 100).toFixed(2)}'],`);
  lines.push(`  },`);
  lines.push(`};`);
  lines.push(``);
  const httpSteps = actionNodes.filter((n) => n.action === "http:request");
  for (const node of httpSteps) {
    const varName = k6VarName(node.label || "request");
    lines.push(`const ${varName}Duration = new Trend('${varName}_duration');`);
  }
  if (httpSteps.length) lines.push(``);
  lines.push(`export default function () {`);
  lines.push(`  let res;`);
  const declaredVars = /* @__PURE__ */ new Set();
  let lastHttpVarName = "res";
  let lastHttpNodeLabel = "";
  for (const node of actionNodes) {
    const action = node.action;
    if (action === "set:variable") {
      const varName = node.variable;
      const val = toK6Value(node.value);
      if (!declaredVars.has(varName)) {
        lines.push(`  let ${varName} = ${val};`);
        declaredVars.add(varName);
      } else {
        lines.push(`  ${varName} = ${val};`);
      }
    } else if (action === "http:request") {
      const method = (node.method || "GET").toUpperCase();
      const url = toK6Value(node.url);
      const metricVar = k6VarName(node.label || "request") + "Duration";
      lastHttpNodeLabel = node.label || "";
      lastHttpVarName = `r${httpSteps.indexOf(node) + 1}`;
      const paramParts = [];
      const headerEntries = [];
      const rawHeaders = node.headers || {};
      for (const [k, v] of Object.entries(rawHeaders)) {
        headerEntries.push(`'${k}': ${toK6Value(v)}`);
      }
      const auth = node.auth;
      if (auth?.type === "bearer") {
        headerEntries.push(`'Authorization': \`Bearer \${${toK6Var(auth.token || "")}}\``);
      } else if (auth?.type === "basic") {
        headerEntries.push(`'Authorization': 'Basic ' + btoa(\`\${${toK6Var(auth.username || "")}}:\${${toK6Var(auth.password || "")}}\`)`);
      } else if (auth?.type === "apikey") {
        headerEntries.push(`'${auth.header || "X-API-Key"}': ${toK6Value(auth.key || "")}`);
      }
      if (headerEntries.length) {
        paramParts.push(`headers: { ${headerEntries.join(", ")} }`);
      }
      const paramStr = paramParts.length ? `, { ${paramParts.join(", ")} }` : "";
      if (["GET", "DELETE", "HEAD"].includes(method)) {
        lines.push(`  const ${lastHttpVarName} = http.${method.toLowerCase()}(${url}${paramStr});`);
      } else {
        const bodyVal = node.body ? toK6Value(node.body) : "null";
        const hasContentType = headerEntries.some((h) => h.includes("Content-Type"));
        const ctHeader = hasContentType ? "" : `, headers: { 'Content-Type': 'application/json' }`;
        const bodyStr = `JSON.stringify(${bodyVal})`;
        const pStr = paramParts.length ? `, { ${paramParts.join(", ")}${ctHeader} }` : `, { headers: { 'Content-Type': 'application/json' } }`;
        lines.push(`  const ${lastHttpVarName} = http.${method.toLowerCase()}(${url}, ${bodyStr}${pStr});`);
      }
      lines.push(`  ${metricVar}.add(${lastHttpVarName}.timings.duration);`);
      const extract = node.extract;
      if (extract) {
        for (const [varName, jp] of Object.entries(extract)) {
          const jsonKey = jp.replace(/^\$\.?/, "");
          if (!declaredVars.has(varName)) {
            lines.push(`  let ${varName} = ${lastHttpVarName}.json('${jsonKey}');`);
            declaredVars.add(varName);
          } else {
            lines.push(`  ${varName} = ${lastHttpVarName}.json('${jsonKey}');`);
          }
        }
      }
    } else if (action === "assert:response" || action.startsWith("assert:")) {
      const assertType = node.assert || "status";
      const checkLabel = node.label || `assert ${assertType}`;
      let checkFn = "";
      switch (assertType) {
        case "status":
          checkFn = `(r) => r.status === ${node.expected ?? 200}`;
          break;
        case "body:contains":
          checkFn = `(r) => r.body.includes(${JSON.stringify(node.expected ?? "")})`;
          break;
        case "json:path": {
          const jp = (node.path || "").replace(/^\$\.?/, "");
          checkFn = `(r) => String(r.json('${jp}')) === ${JSON.stringify(String(node.expected ?? ""))}`;
          break;
        }
        case "json:exists": {
          const jp = (node.path || "").replace(/^\$\.?/, "");
          checkFn = `(r) => r.json('${jp}') !== null`;
          break;
        }
        case "header":
          checkFn = `(r) => r.headers['${node.header ?? ""}'] !== undefined`;
          break;
        case "time":
          checkFn = `(r) => r.timings.duration < ${node.expected ?? 2e3}`;
          break;
        default:
          checkFn = `() => true /* ${assertType} */`;
      }
      lines.push(`  check(${lastHttpVarName}, { ${JSON.stringify(checkLabel)}: ${checkFn} });`);
    } else if (action === "extract:json") {
      const varName = node.variable;
      const jp = (node.path || "").replace(/^\$\.?/, "");
      if (!declaredVars.has(varName)) {
        lines.push(`  let ${varName} = ${lastHttpVarName}.json('${jp}');`);
        declaredVars.add(varName);
      } else {
        lines.push(`  ${varName} = ${lastHttpVarName}.json('${jp}');`);
      }
    }
  }
  lines.push(`  sleep(0.1);`);
  lines.push(`}`);
  return lines.join("\n");
}
function k6VarName(label) {
  return label.replace(/[^a-zA-Z0-9]/g, "_").replace(/^_+|_+$/g, "").replace(/_+/g, "_").toLowerCase() || "step";
}
function toK6Value(val) {
  if (typeof val === "string") {
    if (val.includes("{{")) {
      const converted = val.replace(/\{\{(\w+)\}\}/g, (_, k) => `\${${k}}`);
      return `\`${converted}\``;
    }
    return JSON.stringify(val);
  }
  if (typeof val === "object" && val !== null) {
    const entries = Object.entries(val).map(([k, v]) => `${JSON.stringify(k)}: ${toK6Value(v)}`).join(", ");
    return `{ ${entries} }`;
  }
  return JSON.stringify(val);
}
function toK6Var(val) {
  if (val.match(/^\{\{(\w+)\}\}$/)) return val.replace(/^\{\{(\w+)\}\}$/, "$1");
  return JSON.stringify(val);
}
async function isOllamaRunning() {
  const baseUrl = process.env.GHOSTRUN_OLLAMA_URL || "http://localhost:11434";
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(2e3) });
    if (!res.ok) return null;
    const data = await res.json();
    const preferred = process.env.GHOSTRUN_OLLAMA_MODEL;
    if (preferred) return preferred;
    const models = data.models || [];
    const gemma = models.find((m) => m.name.startsWith("gemma"));
    return gemma?.name || models[0]?.name || null;
  } catch {
    return null;
  }
}
async function callOllama(prompt) {
  const baseUrl = process.env.GHOSTRUN_OLLAMA_URL || "http://localhost:11434";
  const model = process.env.GHOSTRUN_OLLAMA_MODEL || await isOllamaRunning();
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
  const provider = process.env.GHOSTRUN_AI_PROVIDER;
  if (provider !== "anthropic") {
    const result2 = await callOllama(prompt);
    if (result2) return { text: result2, provider: process.env.GHOSTRUN_OLLAMA_MODEL || "ollama" };
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
  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557
  \u2551                                              \u2551
  \u2551   \u2591\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2591\u2588\u2588\u2557  \u2588\u2588\u2557\u2591\u2588\u2588\u2588\u2588\u2588\u2557\u2591\u2591\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2551
  \u2551   \u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u2591\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u255A\u2550\u2550\u2588\u2588\u2554\u2550\u2550\u255D \u2551
  \u2551   \u2588\u2588\u2551\u2591\u2591\u2588\u2588\u2557\u2591\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2551\u2591\u2591\u2588\u2588\u2551\u255A\u2588\u2588\u2588\u2588\u2588\u2557\u2591   \u2588\u2588\u2551    \u2551
  \u2551   \u2588\u2588\u2551\u2591\u2591\u255A\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2551\u2588\u2588\u2551\u2591\u2591\u2588\u2588\u2551\u2591\u255A\u2550\u2550\u2550\u2588\u2588\u2557   \u2588\u2588\u2551    \u2551
  \u2551   \u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2551  \u2588\u2588\u2551\u255A\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D   \u2588\u2588\u2551    \u2551
  \u2551   \u2591\u255A\u2550\u2550\u2550\u2550\u2550\u255D \u255A\u2550\u255D  \u255A\u2550\u255D \u255A\u2550\u2550\u2550\u2550\u255D \u255A\u2550\u2550\u2550\u2550\u2550\u255D    \u255A\u2550\u255D    \u2551
  \u2551                                              \u2551
  \u2551   \u{1F47B}  Record once. Replay as a ghost.        \u2551
  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D
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
function timeAgo(dateStr) {
  const date = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  const sec = Math.floor((Date.now() - date.getTime()) / 1e3);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)}d ago`;
  return date.toLocaleDateString();
}
function passRateDots(rate, total) {
  if (total === 0) return import_chalk.default.gray("no runs");
  const filled = Math.round(rate * 6);
  return import_chalk.default.green("\u25CF".repeat(filled)) + import_chalk.default.gray("\u25CB".repeat(6 - filled)) + import_chalk.default.gray(` ${Math.round(rate * 100)}%`);
}
function progressBar(current, total, width = 20) {
  const filled = Math.round(current / total * width);
  return import_chalk.default.cyan("\u2588".repeat(filled)) + import_chalk.default.gray("\u2591".repeat(width - filled));
}
function getEnvLabel(url) {
  if (!url) return { label: "", color: import_chalk.default.white };
  if (url.includes("localhost") || url.includes("127.0.0.1")) return { label: "local", color: import_chalk.default.blue };
  if (url.includes("staging") || url.includes("stage") || url.includes("preprod")) return { label: "staging", color: import_chalk.default.yellow };
  return { label: "production", color: import_chalk.default.red };
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
var RECORDER_SCRIPT = `
(function() {
  if (window.__ghostrunInjected) return;
  window.__ghostrunInjected = true;

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
    window.__ghostrunRecord({ type: 'click', selector: sel, label: label, url: window.location.href, timestamp: now });
  }, true);

  document.addEventListener('blur', function(e) {
    const target = e.target;
    if (!isInputField(target) || !target.value) return;
    window.__ghostrunRecord({ type: 'fill', selector: getBestSelector(target), value: target.value, url: window.location.href, timestamp: Date.now() });
  }, true);

  document.addEventListener('change', function(e) {
    const target = e.target;
    const tag = target.tagName ? target.tagName.toLowerCase() : '';
    if (tag === 'select') window.__ghostrunRecord({ type: 'select', selector: getBestSelector(target), value: target.value, url: window.location.href, timestamp: Date.now() });
    if (tag === 'input' && (target.type === 'checkbox' || target.type === 'radio'))
      window.__ghostrunRecord({ type: 'check', selector: getBestSelector(target), value: String(target.checked), url: window.location.href, timestamp: Date.now() });
  }, true);
})();
`;
function parseVars(argv) {
  const vars = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--var" && argv[i + 1]) {
      const eq = argv[i + 1].indexOf("=");
      if (eq !== -1) {
        vars[argv[i + 1].slice(0, eq)] = argv[i + 1].slice(eq + 1);
      }
      i++;
    }
  }
  const envFile = path2.join(process.cwd(), ".ghostrun.env");
  if (fs2.existsSync(envFile)) {
    const lines = fs2.readFileSync(envFile, "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq !== -1) {
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim();
        if (key && !(key in vars)) vars[key] = val;
      }
    }
  }
  return vars;
}
function resolveVars(text, vars) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] !== void 0 ? vars[k] : `{{${k}}}`);
}
async function loadSession(context, name) {
  const sessionPath = path2.join(DATA_PATH2, "sessions", `${name}.json`);
  if (!fs2.existsSync(sessionPath)) throw new Error(`Session not found: ${name}. Run with --save-session first.`);
  const cookies = JSON.parse(fs2.readFileSync(sessionPath, "utf-8"));
  await context.addCookies(cookies);
  return cookies.length;
}
async function saveSession(context, name) {
  const cookies = await context.cookies();
  const sessionPath = path2.join(DATA_PATH2, "sessions", `${name}.json`);
  fs2.writeFileSync(sessionPath, JSON.stringify(cookies, null, 2));
  return cookies.length;
}
async function runLearn(url, nameOverride) {
  printLogo();
  divider();
  let flowName = nameOverride || args[2];
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
  const flow = db.createFlow({ name: flowName, appUrl: url, createdBy: "human" });
  const capturedActions = [];
  let browserClosed = false;
  const browser = await import_playwright.chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.exposeFunction("__ghostrunRecord", (action) => {
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
  context.on("page", async (newPage) => {
    capturedActions.push({ type: "navigate", url: newPage.url(), timestamp: Date.now(), label: "[new tab]" });
    await newPage.exposeFunction("__ghostrunRecord", (action) => {
      const last = capturedActions[capturedActions.length - 1];
      if (last && last.type === action.type && last.selector === action.selector && Date.now() - last.timestamp < 500) return;
      const tabAction = { ...action, label: action.label ? `[popup] ${action.label}` : action.label };
      const sanitized = { ...tabAction, value: tabAction.value ? sanitizePII(tabAction.value) : tabAction.value };
      capturedActions.push(sanitized);
      process.stdout.write(`  ${import_chalk.default.cyan("[popup]")} ${sanitized.type} ${sanitized.label ? import_chalk.default.white(`"${sanitized.label}"`) : ""} ${import_chalk.default.gray(sanitized.selector || "")}
`);
    });
    await newPage.addInitScript(RECORDER_SCRIPT);
    newPage.on("framenavigated", (frame) => {
      if (frame !== newPage.mainFrame()) return;
      const navUrl = frame.url();
      if (navUrl === "about:blank") return;
      capturedActions.push({ type: "navigate", url: navUrl, timestamp: Date.now(), label: "[popup nav]" });
      process.stdout.write(`  ${import_chalk.default.cyan("[popup]")} navigate \u2192 ${import_chalk.default.cyan(navUrl)}
`);
    });
  });
  console.log(import_chalk.default.bgCyan.black.bold("  RECORDING  ") + import_chalk.default.bold(" \u{1F464} human flow \u2014 browser is live\n"));
  console.log(import_chalk.default.gray("  Every click, fill, and navigation is captured automatically."));
  console.log(import_chalk.default.gray("  Assertions: type  ") + import_chalk.default.cyan("a text:<expected>") + import_chalk.default.gray("  |  ") + import_chalk.default.cyan("a url:<path>") + import_chalk.default.gray("  |  ") + import_chalk.default.cyan("a title:<text>"));
  console.log(import_chalk.default.gray("  Done?       press ") + import_chalk.default.cyan("Enter") + import_chalk.default.gray(" or type ") + import_chalk.default.cyan("done") + import_chalk.default.gray("\n"));
  await page.goto(url);
  if (!browserClosed) {
    await new Promise((resolve) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.on("line", (line) => {
        const trimmed = line.trim();
        if (!trimmed || ["done", "stop", "finish"].includes(trimmed.toLowerCase())) {
          rl.close();
          resolve();
          return;
        }
        const assertMatch = trimmed.match(/^a (text|url|el|title):\s*(.+)$/i);
        if (assertMatch) {
          const assertType = assertMatch[1].toLowerCase();
          const assertValue = assertMatch[2].trim();
          const typeMap = { text: "assert:text", url: "assert:url", el: "assert:element", title: "assert:title" };
          const actionType = typeMap[assertType] || `assert:${assertType}`;
          const isEl = assertType === "el";
          const action = { type: actionType, timestamp: Date.now(), assertType, ...isEl ? { selector: assertValue } : { value: assertValue } };
          capturedActions.push(action);
          process.stdout.write(`  ${import_chalk.default.magenta("\u2713")} assertion added: ${import_chalk.default.yellow(actionType)} ${import_chalk.default.white(assertValue)}
`);
        }
      });
      rl.on("close", () => resolve());
    }).catch(() => {
    });
  }
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
    else if (action.type.startsWith("assert:")) {
      const isEl = action.type === "assert:element";
      node = { id: nodeId, type: "action", label: `Assert ${action.type.replace("assert:", "")} "${isEl ? action.selector : action.value}"`, action: action.type, ...isEl ? { selector: action.selector } : { value: action.value } };
    } else return;
    nodes.push(node);
    edges.push({ id: `e${i}`, source: prevId, target: nodeId });
    prevId = nodeId;
  });
  nodes.push({ id: "end", type: "end", label: "End" });
  edges.push({ id: `e${capturedActions.length}`, source: prevId, target: "end" });
  db.updateFlow(flow.id, { graph: { nodes, edges, appUrl: url } });
  divider();
  console.log(import_chalk.default.bgGreen.black.bold("  SAVED  ") + import_chalk.default.bold(` ${capturedActions.length} actions recorded \u2014 \u{1F464} human flow
`));
  const counts = capturedActions.reduce((a, c) => {
    a[c.type] = (a[c.type] || 0) + 1;
    return a;
  }, {});
  const actionIcons = { navigate: "\u{1F310}", click: "\u{1F5B1} ", fill: "\u2328\uFE0F ", select: "\u{1F4CB}", check: "\u2611\uFE0F ", assert: "\u2705" };
  const countStrs = Object.entries(counts).map(([t, n]) => `${actionIcons[t] || "\u25CF"} ${n} ${t}`);
  console.log("  " + countStrs.join(import_chalk.default.gray("  \xB7  ")));
  console.log();
  info(`Flow ID: ${import_chalk.default.gray(flow.id.slice(0, 8))}`);
  info(`Run:     ${import_chalk.default.green("ghostrun run " + flow.id.slice(0, 8))}`);
  info(`Fix:     ${import_chalk.default.cyan("ghostrun flow:fix " + flow.id.slice(0, 8))}`);
  console.log();
}
async function executeFlow(flowId, vars, opts) {
  const log = (s) => {
    if (!opts?.jsonOutput && !opts?.quiet) process.stdout.write(s + "\n");
  };
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
    return { passed: false, runId: "", duration: 0, extractedData: {} };
  }
  if (!graph.nodes?.length) {
    warn("Empty flow.");
    return { passed: false, runId: "", duration: 0, extractedData: {} };
  }
  if (!opts?.jsonOutput && vars && Object.keys(vars).length > 0) {
    console.log(import_chalk.default.gray("  Variables: " + Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(", ")));
  }
  const startUrl = graph.appUrl || flow.appUrl;
  const { label: envLabel, color: envColor } = getEnvLabel(startUrl || "");
  const creatorIcon = flow.createdBy === "agent" ? import_chalk.default.magenta(" \u{1F916}") : import_chalk.default.blue(" \u{1F464}");
  const verifiedBadge = flow.verified ? import_chalk.default.green(" \u2713") : "";
  const provenanceStr = creatorIcon + verifiedBadge;
  if (!opts?.jsonOutput) {
    if (envLabel === "production") {
      console.log(import_chalk.default.red("\n  \u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510"));
      console.log(import_chalk.default.red("  \u2502 \u26A0 PRODUCTION ENVIRONMENT            \u2502"));
      console.log(import_chalk.default.red("  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518"));
    }
    console.log(import_chalk.default.bold("\n  Running: ") + import_chalk.default.white(flow.name) + provenanceStr);
    if (startUrl) console.log("  " + import_chalk.default.gray("URL: ") + envColor(startUrl));
  }
  const run = db.createRun(flow.id);
  const screenshotsDir = db.getScreenshotsPath(run.id);
  const actionNodes = graph.nodes.filter((n) => n.type === "action");
  let stepNum = 1, failed = false;
  let failedStepInfo = null;
  const runStart = Date.now();
  const runVars = { ...vars || {} };
  const activeEnv = db.getActiveEnvironment();
  if (activeEnv) {
    Object.assign(runVars, activeEnv.variables);
    if (activeEnv.baseUrl && !runVars["__baseUrl"]) runVars["__baseUrl"] = activeEnv.baseUrl;
  }
  const ctx = { variables: runVars, environmentName: activeEnv?.name };
  const API_ONLY_ACTIONS = /* @__PURE__ */ new Set(["http:request", "assert:response", "assert:status", "assert:body", "assert:header", "assert:time", "set:variable", "extract:json", "env:switch"]);
  const hasBrowserActions = actionNodes.some((n) => !API_ONLY_ACTIONS.has(n.action));
  let browser = null;
  let browserCtx = null;
  let page = null;
  if (hasBrowserActions) {
    browser = await import_playwright.chromium.launch({ headless: !opts?.visible });
    browserCtx = await browser.newContext();
    page = await browserCtx.newPage();
    if (opts?.sessionLoad) {
      try {
        const count = await loadSession(browserCtx, opts.sessionLoad);
        if (!opts?.quiet) info(`Session: ${import_chalk.default.cyan(opts.sessionLoad)} loaded (${count} cookies)`);
      } catch (e) {
        warn(String(e));
      }
    }
    if (startUrl) await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 15e3 });
  }
  let PNG = null;
  let pixelmatch2 = null;
  try {
    const pngjs = await Promise.resolve().then(() => __toESM(require_png()));
    PNG = pngjs.PNG;
    pixelmatch2 = (await Promise.resolve().then(() => (init_pixelmatch(), pixelmatch_exports))).default;
  } catch {
  }
  for (const node of actionNodes) {
    const label = node.label, action = node.action;
    const barStr = progressBar(stepNum, actionNodes.length);
    log(import_chalk.default.cyan(`
  [${stepNum}/${actionNodes.length}]`) + ` ${barStr} ` + import_chalk.default.white(label));
    opts?.onStep?.(stepNum - 1, action, node.selector);
    const step = db.createStep({ runId: run.id, stepNumber: stepNum, name: label, action, selector: node.selector, value: node.value });
    const t = Date.now();
    try {
      const resolvedNode = {
        ...node,
        url: node.url ? resolveVars(node.url, runVars) : node.url,
        value: node.value ? resolveVars(node.value, runVars) : node.value,
        selector: node.selector ? resolveVars(node.selector, runVars) : node.selector
      };
      await executeAction(page, action, resolvedNode, ctx, run.id, stepNum);
      if (action === "click" && page) {
        await page.waitForLoadState("domcontentloaded", { timeout: 3e3 }).catch(() => {
        });
      }
      const duration = Date.now() - t;
      const isApiAction = API_ONLY_ACTIONS.has(action);
      if (!isApiAction && page) {
        const screenshot = await page.screenshot();
        const sp = path2.join(screenshotsDir, `step-${stepNum}.png`);
        fs2.writeFileSync(sp, screenshot);
        let diffPercent;
        const baseline = db.getBaseline(flow.id, stepNum);
        if (baseline && PNG && pixelmatch2 && fs2.existsSync(baseline.screenshot_path)) {
          try {
            const img1 = PNG.sync.read(fs2.readFileSync(baseline.screenshot_path));
            const img2 = PNG.sync.read(screenshot);
            const w = Math.min(img1.width, img2.width);
            const h = Math.min(img1.height, img2.height);
            const diff = new PNG({ width: w, height: h });
            const numDiff = pixelmatch2(img1.data, img2.data, diff.data, w, h, { threshold: 0.1 });
            diffPercent = parseFloat((numDiff / (w * h) * 100).toFixed(1));
            if (diffPercent > 5) {
              log(import_chalk.default.yellow(`      ~ visual change: ${diffPercent}%`));
            }
          } catch {
          }
        }
        db.updateStep(step.id, { status: "passed", duration, screenshotPath: sp, ...diffPercent !== void 0 ? { diffPercent } : {} });
        if (diffPercent !== void 0 && diffPercent > 5) {
          db.updateStep(step.id, { errorMessage: `[DIFF:${diffPercent}%]` });
        }
      } else {
        db.updateStep(step.id, { status: "passed", duration });
      }
      log(import_chalk.default.green(`      \u2713 passed`) + import_chalk.default.gray(` (${duration}ms)`));
      if (action === "extract" && resolvedNode.__extracted) {
        const extracted = resolvedNode.__extracted;
        db.saveRunData(run.id, stepNum, extracted.variable, extracted.value);
        runVars[extracted.variable] = extracted.value;
        log(import_chalk.default.cyan(`      \u2192 extracted ${extracted.variable}: ${import_chalk.default.white(extracted.value.slice(0, 60))}`));
      }
    } catch (err) {
      const duration = Date.now() - t;
      let errorMessage = err instanceof Error ? err.message.split("\n")[0] : String(err);
      if (["click", "fill", "select"].includes(action) && page) {
        const healed = await attemptHeal(page, label, node.selector, action);
        if (healed) {
          try {
            const healedNode = { ...node, selector: healed };
            await executeAction(page, action, healedNode, ctx, run.id, stepNum);
            if (action === "click") await page.waitForLoadState("domcontentloaded", { timeout: 3e3 }).catch(() => {
            });
            const healDuration = Date.now() - t;
            const screenshot = await page.screenshot();
            const sp = path2.join(screenshotsDir, `step-${stepNum}.png`);
            fs2.writeFileSync(sp, screenshot);
            log(import_chalk.default.yellow(`      ~ healed selector: ${healed}`));
            db.updateStep(step.id, { status: "passed", duration: healDuration, screenshotPath: sp, errorMessage: `[HEALED: ${healed}]` });
            log(import_chalk.default.green(`      \u2713 passed after heal (${healDuration}ms)`));
            stepNum++;
            continue;
          } catch {
          }
        }
      }
      try {
        if (page) {
          const screenshot = await page.screenshot();
          const sp = path2.join(screenshotsDir, `step-${stepNum}-FAILED.png`);
          fs2.writeFileSync(sp, screenshot);
          db.updateStep(step.id, { status: "failed", duration, errorMessage, screenshotPath: sp });
        } else {
          db.updateStep(step.id, { status: "failed", duration, errorMessage });
        }
      } catch {
        db.updateStep(step.id, { status: "failed", duration, errorMessage });
      }
      log(import_chalk.default.red(`      \u2717 failed (${duration}ms)`));
      log(import_chalk.default.red(`        \u2514\u2500 ${errorMessage}`));
      failedStepInfo = { name: label, action, selector: node.selector, errorMessage };
      opts?.onError?.(errorMessage);
      failed = true;
      break;
    }
    stepNum++;
  }
  if (opts?.sessionSave && browserCtx) {
    try {
      const count = await saveSession(browserCtx, opts.sessionSave);
      if (!opts?.quiet) success(`Session saved: ${import_chalk.default.cyan(opts.sessionSave)} (${count} cookies)`);
    } catch (e) {
      warn(`Could not save session: ${e}`);
    }
  }
  if (browser) await browser.close();
  const totalDuration = Date.now() - runStart;
  let summary = null;
  if (failed && failedStepInfo) {
    if (!opts?.jsonOutput) process.stdout.write(import_chalk.default.gray("\n  Analyzing failure...\n"));
    const steps = db.listSteps(run.id);
    const result = await callAI(buildFailurePrompt({ flowName: flow.name, steps: steps.map((s) => ({ stepNumber: s.stepNumber, name: s.name, action: s.action, selector: s.selector, status: s.status, errorMessage: s.errorMessage })), failedStep: failedStepInfo }));
    if (result) {
      summary = result.text;
      if (!opts?.jsonOutput) process.stdout.write(import_chalk.default.gray(`  (via ${result.provider})
`));
    }
  }
  db.updateRun(run.id, { status: failed ? "failed" : "passed", completedAt: /* @__PURE__ */ new Date(), duration: totalDuration, errorMessage: failedStepInfo?.errorMessage, summary: summary || void 0 });
  const extractedData = {};
  db.getRunData(run.id).forEach((d) => {
    extractedData[d.variableName] = d.variableValue;
  });
  if (opts?.jsonOutput) {
    const steps = db.listSteps(run.id);
    console.log(JSON.stringify({
      passed: !failed,
      runId: run.id,
      flowId: flow.id,
      flowName: flow.name,
      duration: totalDuration,
      steps: steps.map((s) => ({
        stepNumber: s.stepNumber,
        name: s.name,
        status: s.status,
        duration: s.duration,
        screenshotPath: s.screenshotPath,
        errorMessage: s.errorMessage
      })),
      extractedData,
      summary
    }));
    return { passed: !failed, runId: run.id, duration: totalDuration, extractedData, error: failedStepInfo?.errorMessage };
  }
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
  return { passed: !failed, runId: run.id, duration: totalDuration, extractedData, error: failedStepInfo?.errorMessage };
}
async function executeAction(page, action, node, ctx, runId, stepNumber) {
  const p = page;
  switch (action) {
    case "navigate":
      await p.goto(node.url || node.value, { waitUntil: "domcontentloaded", timeout: 15e3 });
      break;
    case "click":
      await p.click(node.selector, { timeout: 1e4 });
      break;
    case "fill":
      await p.fill(node.selector, sanitizePII(node.value || ""), { timeout: 1e4 });
      break;
    case "select":
      await p.selectOption(node.selector, node.value || "", { timeout: 1e4 });
      break;
    case "check":
      if (node.value === "true") await p.check(node.selector, { timeout: 1e4 });
      else await p.uncheck(node.selector, { timeout: 1e4 });
      break;
    case "wait":
      await p.waitForSelector(node.selector, { timeout: 1e4 });
      break;
    case "press":
      await p.press(node.selector, node.value || "Enter");
      break;
    case "assert:text": {
      const val = node.value;
      const count = await p.getByText(val, { exact: false }).count();
      const visible = count > 0 ? await p.getByText(val, { exact: false }).first().isVisible({ timeout: 5e3 }).catch(() => false) : false;
      if (!visible) {
        const bodyText = await p.evaluate(() => document.body.innerText).catch(() => "");
        if (!bodyText.includes(val)) throw new Error(`assert:text failed \u2014 "${val}" not visible on page`);
      }
      break;
    }
    case "assert:url": {
      const currentUrl = p.url();
      if (!currentUrl.includes(node.value)) throw new Error(`assert:url failed \u2014 URL "${currentUrl}" does not contain "${node.value}"`);
      break;
    }
    case "assert:element": {
      const count = await p.locator(node.selector).count();
      if (count === 0) throw new Error(`assert:element failed \u2014 selector "${node.selector}" not found`);
      break;
    }
    case "assert:title": {
      const title = await p.title();
      if (!title.toLowerCase().includes(node.value.toLowerCase())) throw new Error(`assert:title failed \u2014 title "${title}" does not contain "${node.value}"`);
      break;
    }
    case "assert:no-errors": {
      break;
    }
    case "extract": {
      const variable = node.variable || "extracted";
      const selector = node.selector;
      let extractedValue = "";
      if (selector) {
        try {
          extractedValue = await p.locator(selector).first().innerText({ timeout: 1e4 });
        } catch {
          extractedValue = await p.locator(selector).first().getAttribute("value") || "";
        }
      } else if (node.attribute && node.selector) {
        extractedValue = await p.locator(node.selector).first().getAttribute(node.attribute) || "";
      }
      node.__extracted = { variable, value: extractedValue.trim() };
      break;
    }
    case "scroll:bottom":
      await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise((r) => setTimeout(r, 1500));
      break;
    case "scroll:up":
      await p.evaluate(() => window.scrollTo(0, 0));
      break;
    case "scroll:load": {
      const times = parseInt(node.value || "5", 10);
      for (let i = 0; i < times; i++) {
        const prevHeight = await p.evaluate(() => document.body.scrollHeight);
        await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await new Promise((r) => setTimeout(r, 2e3));
        const newHeight = await p.evaluate(() => document.body.scrollHeight);
        if (newHeight === prevHeight) break;
      }
      break;
    }
    case "next:page": {
      const nextSel = node.selector || 'a[rel="next"], [aria-label="Next page"], [aria-label="Next"], button:has-text("Next"), .next-page, .pagination-next';
      await p.click(nextSel, { timeout: 1e4 });
      await p.waitForLoadState("domcontentloaded", { timeout: 15e3 });
      break;
    }
    case "hover":
      await p.hover(node.selector, { timeout: 1e4 });
      break;
    case "screenshot":
      break;
    // ── Additional interactions ────────────────────────────────────────
    case "dblclick":
      await p.dblclick(node.selector, { timeout: 1e4 });
      break;
    case "type": {
      const delay = parseInt(node.delay || "50", 10);
      await p.type(node.selector, sanitizePII(node.value || ""), { delay });
      break;
    }
    case "clear":
      await p.fill(node.selector, "", { timeout: 1e4 });
      break;
    case "upload": {
      const files = (node.value || "").split(",").map((s) => s.trim()).filter(Boolean);
      if (files.length === 0) throw new Error("upload: no file paths specified in value");
      await p.setInputFiles(node.selector, files, { timeout: 1e4 });
      break;
    }
    case "focus":
      await p.focus(node.selector, { timeout: 1e4 });
      break;
    case "drag": {
      const target = node.value;
      if (!target) throw new Error("drag: value must be the target selector");
      const source = await p.locator(node.selector).first().boundingBox();
      const dest = await p.locator(target).first().boundingBox();
      if (!source || !dest) throw new Error("drag: source or target element not found");
      await p.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
      await p.mouse.down();
      await p.mouse.move(dest.x + dest.width / 2, dest.y + dest.height / 2, { steps: 10 });
      await p.mouse.up();
      break;
    }
    case "keyboard": {
      const key = node.value || "Enter";
      if (node.selector) {
        await p.press(node.selector, key);
      } else {
        await p.keyboard.press(key);
      }
      break;
    }
    case "reload":
      await p.reload({ waitUntil: "domcontentloaded", timeout: 15e3 });
      break;
    case "back":
      await p.goBack({ waitUntil: "domcontentloaded", timeout: 15e3 });
      break;
    case "forward":
      await p.goForward({ waitUntil: "domcontentloaded", timeout: 15e3 });
      break;
    case "wait:text": {
      const waitVal = node.value;
      await p.waitForFunction(
        (text) => document.body.innerText.includes(text),
        waitVal,
        { timeout: 15e3 }
      );
      break;
    }
    case "wait:url": {
      const urlPattern = node.value;
      await p.waitForURL((url) => url.toString().includes(urlPattern), { timeout: 15e3 });
      break;
    }
    case "wait:ms": {
      const ms = parseInt(node.value || "1000", 10);
      await new Promise((r) => setTimeout(r, Math.min(ms, 3e4)));
      break;
    }
    case "scroll:element": {
      await p.locator(node.selector).first().scrollIntoViewIfNeeded({ timeout: 1e4 });
      break;
    }
    case "eval": {
      const script = node.value;
      if (!script) throw new Error("eval: value must be a JavaScript expression");
      await p.evaluate(new Function(script));
      break;
    }
    case "iframe:enter": {
      const frame = p.frameLocator(node.selector);
      p.__activeFrame = frame;
      break;
    }
    case "iframe:exit":
      p.__activeFrame = null;
      break;
    case "assert:visible": {
      const isVisible = await p.locator(node.selector).first().isVisible({ timeout: 1e4 }).catch(() => false);
      if (!isVisible) throw new Error(`assert:visible failed \u2014 "${node.selector}" is not visible`);
      break;
    }
    case "assert:hidden": {
      const isHidden = await p.locator(node.selector).first().isHidden({ timeout: 5e3 }).catch(() => true);
      if (!isHidden) throw new Error(`assert:hidden failed \u2014 "${node.selector}" is visible but expected hidden`);
      break;
    }
    case "assert:value": {
      const inputVal = await p.inputValue(node.selector, { timeout: 1e4 });
      if (!inputVal.includes(node.value)) throw new Error(`assert:value failed \u2014 input value "${inputVal}" does not contain "${node.value}"`);
      break;
    }
    case "assert:count": {
      const expected = parseInt(node.value, 10);
      const actual = await p.locator(node.selector).count();
      if (actual !== expected) throw new Error(`assert:count failed \u2014 found ${actual} elements, expected ${expected}`);
      break;
    }
    case "assert:attr": {
      const [attrName, ...rest] = (node.value || "").split("=");
      const expected = rest.join("=");
      const actual = await p.locator(node.selector).first().getAttribute(attrName, { timeout: 1e4 });
      if (actual === null) throw new Error(`assert:attr failed \u2014 attribute "${attrName}" not found on "${node.selector}"`);
      if (!actual.includes(expected)) throw new Error(`assert:attr failed \u2014 "${attrName}" is "${actual}", expected to contain "${expected}"`);
      break;
    }
    case "cookie:set": {
      const parts = (node.value || "").split(";");
      const [cookieName, cookieVal] = parts[0].split("=");
      const domain = parts.find((cp) => cp.trim().startsWith("domain="))?.split("=")[1] || new URL(p.url()).hostname;
      await p.context().addCookies([{ name: cookieName.trim(), value: cookieVal?.trim() || "", domain, path: "/" }]);
      break;
    }
    case "cookie:clear":
      await p.context().clearCookies();
      break;
    case "storage:set": {
      const eqIdx = (node.value || "").indexOf("=");
      if (eqIdx === -1) throw new Error('storage:set: value must be "key=value"');
      const key = node.value.slice(0, eqIdx);
      const val = node.value.slice(eqIdx + 1);
      await p.evaluate(([k, v]) => localStorage.setItem(k, v), [key, val]);
      break;
    }
    case "assert:not-text": {
      const bodyText = await p.evaluate(() => document.body.innerText).catch(() => "");
      if (bodyText.includes(node.value)) throw new Error(`assert:not-text failed \u2014 "${node.value}" IS present on page (expected absent)`);
      break;
    }
    case "http:request":
      if (!ctx) throw new Error("http:request requires execution context");
      await executeHttpRequest(node, ctx, runId, stepNumber);
      break;
    case "assert:response":
    case "assert:status":
    case "assert:body":
    case "assert:header":
    case "assert:time":
      if (!ctx) throw new Error("assert actions require execution context");
      await executeApiAssert(node, ctx);
      break;
    case "set:variable":
      if (!ctx) throw new Error("set:variable requires execution context");
      executeSetVariable(node, ctx, runId, stepNumber);
      break;
    case "extract:json":
      if (!ctx) throw new Error("extract:json requires execution context");
      executeExtractJson(node, ctx, runId, stepNumber);
      break;
    case "env:switch": {
      const envName = resolveVarsDeep(node.environment, ctx);
      const env = db.findEnvironmentByName(envName);
      if (!env) throw new Error(`Environment "${envName}" not found`);
      db.setActiveEnvironment(env.id);
      if (ctx) {
        ctx.environmentName = env.name;
        for (const [k, v] of Object.entries(env.variables)) ctx.variables[k] = v;
        if (env.baseUrl) ctx.variables["__baseUrl"] = env.baseUrl;
      }
      break;
    }
  }
}
async function attemptHeal(page, label, selector, _action) {
  if (!selector) return null;
  process.stdout.write(import_chalk.default.yellow("      ~ attempting selector heal...\n"));
  const cleaned = label.replace(/^(click|tap|press|fill|type in|type|select|check|uncheck|submit|go to|navigate to)\s+/i, "").replace(/\s+(link|button|field|input|checkbox|dropdown|option|element|btn|tab|menu|item)$/i, "").trim();
  const textCandidates = [
    [`a:has-text("${cleaned}")`, "text-link"],
    [`button:has-text("${cleaned}")`, "text-button"],
    [`:has-text("${cleaned}") >> visible=true`, "text-any"],
    // Try partial label words
    ...cleaned.split(/\s+/).filter((w) => w.length > 2).slice(0, 3).flatMap((word) => [
      [`a:has-text("${word}")`, "word-link"],
      [`button:has-text("${word}")`, "word-button"]
    ])
  ];
  for (const [candidate, strategy] of textCandidates) {
    try {
      const count = await page.locator(candidate).count();
      if (count > 0) {
        process.stdout.write(import_chalk.default.yellow(`      ~ healed via ${strategy}: ${candidate}
`));
        return candidate;
      }
    } catch {
    }
  }
  const hasAI = !!await isOllamaRunning() || !!process.env.ANTHROPIC_API_KEY;
  if (!hasAI) return null;
  try {
    const pageTitle = await page.title().catch(() => "");
    const elementsHtml = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('a,button,input,select,textarea,[role="button"]'));
      return els.slice(0, 30).map((el) => {
        const attrs = Array.from(el.attributes).map((a) => `${a.name}="${a.value}"`).join(" ");
        const text = el.innerText?.trim().slice(0, 40) || "";
        return `<${el.tagName.toLowerCase()} ${attrs}>${text}</${el.tagName.toLowerCase()}>`;
      }).join("\n");
    }).catch(() => "");
    const prompt = `Given these interactive elements on a web page, return ONLY the CSS selector (no explanation) for: "${label}"

Page: ${pageTitle}
Elements:
${elementsHtml}

Return just the selector, like: a[href="/login"]`;
    const result = await callAI(prompt);
    if (result?.text) {
      const healed = result.text.trim().replace(/^['"`]|['"`]$/g, "").split("\n")[0].trim();
      if (healed && !healed.includes(" ") && healed.length < 100) {
        const count = await page.locator(healed).count().catch(() => 0);
        if (count > 0) return healed;
      }
    }
  } catch {
  }
  return null;
}
async function runFlow(id, vars) {
  const visible = process.argv.includes("--visible");
  const outputIdx = process.argv.indexOf("--output");
  const jsonOutput = outputIdx !== -1 && process.argv[outputIdx + 1] === "json";
  if (!jsonOutput) {
    printLogo();
    divider();
  }
  let flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
  if (!flow) {
    errorMsg("Flow not found: " + id);
    process.exit(1);
  }
  if (!jsonOutput) console.log(import_chalk.default.bold("\n  Running: ") + import_chalk.default.white(flow.name) + (visible ? import_chalk.default.yellow(" [visible]") : "") + "\n");
  const result = await executeFlow(id, vars, { visible, jsonOutput });
  return result?.runId || null;
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
  await page.exposeFunction("__ghostrunRecord", (action) => {
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
      const aiSuggestion = await attemptHeal(page, node.label, node.selector, node.action);
      if (aiSuggestion) console.log(import_chalk.default.yellow(`      AI suggests: ${import_chalk.default.white(aiSuggestion)}`));
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
    info(`Run: ${import_chalk.default.green(`ghostrun run ${flow.id.slice(0, 8)}`)}`);
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
  const diffDir = path2.join(DATA_PATH2, "diffs", `${run1.id.slice(0, 8)}_vs_${run2.id.slice(0, 8)}`);
  fs2.mkdirSync(diffDir, { recursive: true });
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
    if (!p1 || !p2 || !fs2.existsSync(p1) || !fs2.existsSync(p2)) {
      console.log(`  ${import_chalk.default.gray(String(i).padStart(4))}  ${import_chalk.default.yellow("missing  ")}  ${import_chalk.default.gray("N/A    ")}  ${import_chalk.default.gray(name)}`);
      missing++;
      continue;
    }
    try {
      const img1 = PNG.sync.read(fs2.readFileSync(p1));
      const img2 = PNG.sync.read(fs2.readFileSync(p2));
      const w = Math.min(img1.width, img2.width);
      const h = Math.min(img1.height, img2.height);
      const diff = new PNG({ width: w, height: h });
      const numDiff = pixelmatch2(img1.data, img2.data, diff.data, w, h, { threshold: 0.1 });
      const pct = (numDiff / (w * h) * 100).toFixed(1);
      const diffPath = path2.join(diffDir, `step-${i}-diff.png`);
      fs2.writeFileSync(diffPath, PNG.sync.write(diff));
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
  const humanCount = flows.filter((f) => f.createdBy === "human").length;
  const agentCount = flows.filter((f) => f.createdBy === "agent").length;
  console.log(import_chalk.default.bold("\n  Flows"));
  if (flows.length > 0) {
    const parts = [];
    if (humanCount > 0) parts.push(import_chalk.default.blue(`${humanCount} human`));
    if (agentCount > 0) parts.push(import_chalk.default.magenta(`${agentCount} agent`));
    console.log(import_chalk.default.gray("  " + parts.join(import_chalk.default.gray(" \xB7 "))) + "\n");
  } else {
    console.log();
  }
  if (flows.length === 0) {
    warn("No flows. Create one: " + import_chalk.default.cyan("ghostrun learn <url>"));
    console.log();
    return;
  }
  console.log(import_chalk.default.gray("  ID        By  Name                       Env         Steps  Pass rate      Updated"));
  console.log(import_chalk.default.gray("  " + "\u2500".repeat(82)));
  for (const flow of flows) {
    let steps = 0;
    try {
      steps = (JSON.parse(flow.graph).nodes || []).filter((n) => n.type === "action").length;
    } catch {
    }
    const runs = db.listRuns(flow.id, 20);
    const passRate = runs.length > 0 ? runs.filter((r) => r.status === "passed").length / runs.length : -1;
    const rateStr = passRate < 0 ? import_chalk.default.gray("no runs      ") : passRateDots(passRate, runs.length);
    const creatorIcon = flow.createdBy === "agent" ? import_chalk.default.magenta("\u{1F916}") : import_chalk.default.blue("\u{1F464}");
    const env = getEnvLabel(flow.appUrl || "");
    const envBadge = env.label ? env.color(`[${env.label}]`) : "          ";
    const namePad = flow.name.length > 24 ? flow.name.slice(0, 23) + "\u2026" : flow.name.padEnd(24);
    console.log(`  ${import_chalk.default.gray(flow.id.slice(0, 8))} ${creatorIcon}  ${import_chalk.default.white(namePad)}  ${envBadge.padEnd(env.label ? 11 : 10)}  ${import_chalk.default.gray(String(steps).padEnd(5))}  ${rateStr}  ${import_chalk.default.gray(timeAgo(flow.updatedAt))}`);
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
  fs2.writeFileSync(filename, JSON.stringify({ version: "1.0.0", exportedAt: (/* @__PURE__ */ new Date()).toISOString(), flow: { name: flow.name, description: flow.description, appUrl: flow.appUrl, graph: JSON.parse(flow.graph) } }, null, 2));
  success(`Exported to ${import_chalk.default.cyan(filename)}`);
  console.log();
}
async function runImportFlow(filepath) {
  if (!fs2.existsSync(filepath)) {
    errorMsg("File not found: " + filepath);
    process.exit(1);
  }
  let data;
  try {
    data = JSON.parse(fs2.readFileSync(filepath, "utf8"));
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
async function runRenameFlow(id, newName) {
  const flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
  if (!flow) {
    errorMsg("Flow not found: " + id);
    process.exit(1);
  }
  db.updateFlow(flow.id, { name: newName });
  success(`Renamed "${import_chalk.default.gray(flow.name)}" \u2192 "${import_chalk.default.white(newName)}"`);
  console.log();
}
async function runCloneFlow(id) {
  const flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
  if (!flow) {
    errorMsg("Flow not found: " + id);
    process.exit(1);
  }
  const newName = flow.name + " (copy)";
  const created = db.createFlow({ name: newName, description: flow.description ?? void 0, appUrl: flow.appUrl ?? void 0, graph: JSON.parse(flow.graph) });
  success(`Cloned "${import_chalk.default.gray(flow.name)}" \u2192 "${import_chalk.default.white(newName)}"`);
  info("New ID: " + import_chalk.default.gray(created.id.slice(0, 8)));
  console.log();
}
function parseCurlTokens(input) {
  const tokens = [];
  let cur = "";
  let inSingle = false, inDouble = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if ((ch === " " || ch === "\n" || ch === "	") && !inSingle && !inDouble) {
      if (cur) {
        tokens.push(cur);
        cur = "";
      }
      continue;
    }
    if (ch === "\\" && !inSingle) {
      i++;
      if (i < input.length) cur += input[i];
      continue;
    }
    cur += ch;
  }
  if (cur) tokens.push(cur);
  return tokens;
}
async function runFlowFromCurl(curlStr) {
  printLogo();
  divider();
  console.log(import_chalk.default.bold("\n  Import from curl\n"));
  let input = curlStr || "";
  if (!input.trim()) {
    console.log(import_chalk.default.gray("  Paste your curl command (multi-line OK, end with empty line):\n"));
    const lines = [];
    while (true) {
      const line = await askQuestion("  > ");
      if (!line.trim()) break;
      lines.push(line.replace(/\\$/, "").trim());
    }
    input = lines.join(" ");
  }
  input = input.replace(/^curl\s+/, "").trim();
  if (!input) {
    errorMsg("No curl command provided");
    process.exit(1);
  }
  const tokens = parseCurlTokens(input);
  let method = "GET";
  let url = "";
  const headers = {};
  let body;
  let bearerToken = "";
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "-X" || t === "--request") {
      method = tokens[++i]?.toUpperCase() || "GET";
      continue;
    }
    if (t === "-H" || t === "--header") {
      const h = tokens[++i] || "";
      const colon = h.indexOf(":");
      if (colon > 0) {
        const k = h.slice(0, colon).trim();
        const v = h.slice(colon + 1).trim();
        if (k.toLowerCase() === "authorization" && v.toLowerCase().startsWith("bearer ")) {
          bearerToken = v.slice(7).trim();
        } else {
          headers[k] = v;
        }
      }
      continue;
    }
    if (t === "-d" || t === "--data" || t === "--data-raw" || t === "--data-binary") {
      const raw = tokens[++i] || "";
      if (method === "GET") method = "POST";
      try {
        body = JSON.parse(raw);
      } catch {
        body = raw;
      }
      continue;
    }
    if (t === "-u" || t === "--user") {
      const creds = tokens[++i] || "";
      const encoded = Buffer.from(creds).toString("base64");
      headers["Authorization"] = `Basic ${encoded}`;
      continue;
    }
    if (t === "--url") {
      url = tokens[++i] || "";
      continue;
    }
    if (t === "-s" || t === "--silent" || t === "-v" || t === "--verbose" || t === "-i" || t === "--include" || t === "-L" || t === "--location" || t === "--compressed") continue;
    if (t === "-o" || t === "--output" || t === "--max-time" || t === "--connect-timeout" || t === "--proxy") {
      i++;
      continue;
    }
    if (!t.startsWith("-") && !url) url = t;
  }
  if (!url) {
    errorMsg("Could not find URL in curl command");
    process.exit(1);
  }
  const urlPath = (() => {
    try {
      return new URL(url).pathname;
    } catch {
      return url;
    }
  })();
  const defaultName = `${method} ${urlPath.split("/").filter(Boolean).slice(-1)[0] || urlPath}`;
  const name = await askQuestion(import_chalk.default.cyan(`
  Flow name [${defaultName}]: `));
  const flowName = name.trim() || defaultName;
  const nodes = [];
  const nodeId = () => (0, import_uuid2.v4)();
  const httpNode = {
    id: nodeId(),
    type: "action",
    action: "http:request",
    method,
    url,
    label: `${method} ${urlPath}`
  };
  if (Object.keys(headers).length) httpNode.headers = headers;
  if (body !== void 0) httpNode.body = body;
  if (bearerToken) httpNode.auth = { type: "bearer", token: bearerToken };
  nodes.push(httpNode);
  nodes.push({ id: nodeId(), type: "action", action: "assert:response", assert: "status", expected: 200, label: "Assert status 200" });
  const isJson = headers["Content-Type"]?.includes("json") || headers["content-type"]?.includes("json") || typeof body === "object";
  if (isJson || !body && method === "GET") {
    nodes.push({ id: nodeId(), type: "action", action: "assert:response", assert: "time", expected: 2e3, label: "Assert response < 2000ms" });
  }
  const graph = { nodes, edges: [] };
  const created = db.createFlow({ name: flowName, description: `Imported from curl: ${method} ${url}`, appUrl: null, graph });
  console.log();
  success(`Flow created: ${import_chalk.default.white(flowName)}`);
  info(`ID: ${import_chalk.default.gray(created.id.slice(0, 8))}`);
  console.log(import_chalk.default.gray(`
  Nodes created:`));
  for (const n of nodes) console.log(import_chalk.default.gray(`    ${n.label}`));
  console.log(import_chalk.default.gray(`
  Run with: ghostrun run "${flowName}"`));
  console.log(import_chalk.default.gray(`  Add more steps: ghostrun api:learn`));
  console.log();
}
function parseYamlValue(s) {
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "null" || s === "~") return null;
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
  return s.replace(/^["']|["']$/g, "");
}
function parseSimpleYaml(text) {
  const lines = text.split("\n");
  const root = {};
  const stack = [{ obj: root, indent: -1 }];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const indent = line.search(/\S/);
    const trimmed = line.trim();
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack[stack.length - 1].obj;
    if (trimmed.startsWith("- ")) {
      const val = trimmed.slice(2).trim();
      if (Array.isArray(parent)) {
        const parsed = parseYamlValue(val);
        parent.push(parsed);
      }
      continue;
    }
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx < 0) continue;
    const key = trimmed.slice(0, colonIdx).trim().replace(/^["']|["']$/g, "");
    const rest = trimmed.slice(colonIdx + 1).trim();
    if (!Array.isArray(parent)) {
      if (rest === "" || rest === "|" || rest === ">") {
        const child = {};
        parent[key] = child;
        stack.push({ obj: child, indent });
      } else if (rest === "-" || rest.startsWith("- ")) {
        const arr = [];
        parent[key] = arr;
        stack.push({ obj: arr, indent });
      } else {
        parent[key] = parseYamlValue(rest);
      }
    }
  }
  return root;
}
async function runFlowFromSpec(filepath) {
  printLogo();
  divider();
  console.log(import_chalk.default.bold("\n  Import from OpenAPI Spec\n"));
  if (!fs2.existsSync(filepath)) {
    errorMsg("File not found: " + filepath);
    process.exit(1);
  }
  let spec;
  const raw = fs2.readFileSync(filepath, "utf8").trim();
  if (raw.startsWith("{") || raw.startsWith("[")) {
    try {
      spec = JSON.parse(raw);
    } catch {
      errorMsg("Invalid JSON");
      process.exit(1);
      return;
    }
  } else {
    spec = parseSimpleYaml(raw);
  }
  const version = spec.openapi || spec.swagger || "2";
  const specInfo = spec.info || {};
  const title = specInfo.title || path2.basename(filepath, path2.extname(filepath));
  const servers = spec.servers || [];
  const baseUrl = servers[0]?.url || (spec.host ? `https://${spec.host}${spec.basePath || ""}` : "");
  const paths = spec.paths || {};
  console.log(import_chalk.default.gray(`  Spec: ${title} (OpenAPI ${version})`));
  console.log(import_chalk.default.gray(`  Base URL: ${baseUrl || "(not set \u2014 use environment variables)"}`));
  console.log(import_chalk.default.gray(`  Paths: ${Object.keys(paths).length}
`));
  if (Object.keys(paths).length === 0) {
    errorMsg("No paths found in spec");
    process.exit(1);
  }
  const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];
  const tagGroups = {};
  for (const [pathKey, pathItem] of Object.entries(paths)) {
    for (const method of HTTP_METHODS) {
      const op = pathItem[method];
      if (!op) continue;
      const tags2 = op.tags || ["default"];
      const tag = tags2[0] || "default";
      if (!tagGroups[tag]) tagGroups[tag] = [];
      tagGroups[tag].push({ path: pathKey, method, op });
    }
  }
  const tags = Object.keys(tagGroups);
  console.log(import_chalk.default.gray(`  Tags found: ${tags.join(", ")}`));
  console.log(import_chalk.default.cyan("\n  Options:"));
  console.log(import_chalk.default.gray("  1 \u2014 One flow per tag group (recommended)"));
  console.log(import_chalk.default.gray("  2 \u2014 One flow per endpoint"));
  console.log(import_chalk.default.gray("  3 \u2014 Single flow with all endpoints"));
  const choice = (await askQuestion("\n  Choice [1]: ")).trim() || "1";
  const flowsToCreate = [];
  const nodeId = () => (0, import_uuid2.v4)();
  function makeHttpNode(method, pathKey, op, bUrl) {
    const resolvedUrl = bUrl ? `${bUrl.replace(/\/$/, "")}${pathKey}` : pathKey;
    const summary = op.summary || `${method.toUpperCase()} ${pathKey}`;
    const node = {
      id: nodeId(),
      type: "action",
      action: "http:request",
      method: method.toUpperCase(),
      url: resolvedUrl,
      label: summary
    };
    const requestBody = op.requestBody;
    if (requestBody) {
      const content = requestBody.content;
      if (content?.["application/json"]) {
        const schema = content["application/json"]?.schema;
        if (schema?.example) node.body = schema.example;
        else if (schema?.properties) {
          const body = {};
          for (const prop of Object.keys(schema.properties)) body[prop] = `{{${prop}}}`;
          node.body = body;
        }
        node.headers = { "Content-Type": "application/json" };
      }
    }
    const pathParams = (op.parameters || []).filter((p) => p.in === "path");
    if (pathParams.length) {
      let urlStr = node.url;
      for (const p of pathParams) {
        urlStr = urlStr.replace(`{${p.name}}`, `{{${p.name}}}`);
      }
      node.url = urlStr;
    }
    return node;
  }
  function makeAssertNode(successCode = 200) {
    return { id: nodeId(), type: "action", action: "assert:response", assert: "status", expected: successCode, label: `Assert status ${successCode}` };
  }
  if (choice === "1") {
    for (const [tag, ops] of Object.entries(tagGroups)) {
      const nodes = [];
      for (const { path: pathKey, method, op } of ops) {
        nodes.push(makeHttpNode(method, pathKey, op, baseUrl));
        const responses = op.responses || {};
        const successCode = Object.keys(responses).find((c) => Number(c) >= 200 && Number(c) < 300);
        nodes.push(makeAssertNode(successCode ? Number(successCode) : 200));
      }
      flowsToCreate.push({ name: `${title} \u2014 ${tag}`, description: `Auto-generated from OpenAPI spec: ${title}`, nodes });
    }
  } else if (choice === "2") {
    for (const [tag, ops] of Object.entries(tagGroups)) {
      for (const { path: pathKey, method, op } of ops) {
        const summary = op.summary || `${method.toUpperCase()} ${pathKey}`;
        const nodes = [];
        nodes.push(makeHttpNode(method, pathKey, op, baseUrl));
        const responses = op.responses || {};
        const successCode = Object.keys(responses).find((c) => Number(c) >= 200 && Number(c) < 300);
        nodes.push(makeAssertNode(successCode ? Number(successCode) : 200));
        flowsToCreate.push({ name: summary, description: `${tag}: ${method.toUpperCase()} ${pathKey}`, nodes });
      }
    }
  } else {
    const nodes = [];
    for (const [, ops] of Object.entries(tagGroups)) {
      for (const { path: pathKey, method, op } of ops) {
        nodes.push(makeHttpNode(method, pathKey, op, baseUrl));
        nodes.push(makeAssertNode(200));
      }
    }
    flowsToCreate.push({ name: title, description: `Auto-generated from OpenAPI spec: ${filepath}`, nodes });
  }
  console.log();
  for (const f of flowsToCreate) {
    const created = db.createFlow({ name: f.name, description: f.description, appUrl: baseUrl || null, graph: { nodes: f.nodes, edges: [] } });
    success(`Created: ${import_chalk.default.white(f.name)} ${import_chalk.default.gray("(" + f.nodes.length + " steps, id: " + created.id.slice(0, 8) + ")")}`);
  }
  console.log(import_chalk.default.gray(`
  ${flowsToCreate.length} flow(s) created. Run with: ghostrun run "<name>"`));
  if (baseUrl) console.log(import_chalk.default.gray(`  Base URL: ${baseUrl}`));
  else console.log(import_chalk.default.gray(`  Tip: set base URL with: ghostrun env:create dev <base-url>`));
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
  console.log(import_chalk.default.gray("  ID        Flow                         Status   Duration    When"));
  console.log(import_chalk.default.gray("  " + "\u2500".repeat(70)));
  for (const run of runs) {
    const flow = db.getFlow(run.flowId);
    const icon = run.status === "passed" ? import_chalk.default.green("\u2713") : run.status === "failed" ? import_chalk.default.red("\u2717") : import_chalk.default.yellow("\u2026");
    const statusStr = run.status === "passed" ? import_chalk.default.green("passed") : run.status === "failed" ? import_chalk.default.red("failed") : import_chalk.default.yellow(run.status);
    const durStr = run.duration ? run.duration >= 1e3 ? (run.duration / 1e3).toFixed(1) + "s" : run.duration + "ms" : "\u2014";
    const when = run.startedAt ? timeAgo(run.startedAt) : "";
    console.log(`  ${import_chalk.default.gray(run.id.slice(0, 8))} ${icon} ${import_chalk.default.white((flow?.name || "Unknown").padEnd(27).slice(0, 27))} ${statusStr.padEnd(12)} ${import_chalk.default.gray(durStr.padEnd(11))} ${import_chalk.default.gray(when)}`);
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
    const diffStr = step.diffPercent && step.diffPercent > 0 ? import_chalk.default.yellow(` ~${step.diffPercent}%`) : "";
    console.log(`    ${import_chalk.default.gray(String(step.stepNumber).padStart(2))}  ${icon}  ${import_chalk.default.white(step.name)} ${import_chalk.default.gray(step.duration ? step.duration + "ms" : "")}${diffStr}`);
    if (step.errorMessage && step.errorMessage.startsWith("[DIFF:")) console.log(`         ${import_chalk.default.yellow("\u2514\u2500 " + step.errorMessage)}`);
    else if (step.errorMessage && step.errorMessage.startsWith("[HEALED:")) console.log(`         ${import_chalk.default.yellow("\u2514\u2500 " + step.errorMessage)}`);
    else if (step.status === "failed" && step.errorMessage) console.log(`         ${import_chalk.default.red("\u2514\u2500 " + step.errorMessage.slice(0, 80))}`);
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
function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
async function generateRunReport(runId, outFile) {
  const run = db.findRunByPartialId(runId);
  if (!run) return;
  const flow = db.getFlow(run.flowId);
  const steps = db.listSteps(run.id);
  const apiResps = db.getApiResponses ? db.getApiResponses(run.id) : [];
  const statusColor = run.status === "passed" ? "#56d364" : "#f85149";
  const durStr = run.duration ? run.duration >= 1e3 ? (run.duration / 1e3).toFixed(2) + "s" : run.duration + "ms" : "\u2014";
  const stepsHtml = steps.map((step, i) => {
    const icon = step.status === "passed" ? "\u2713" : step.status === "failed" ? "\u2717" : "\u25CB";
    const color = step.status === "passed" ? "#56d364" : step.status === "failed" ? "#f85149" : "#e3b341";
    const dur = step.duration ? step.duration >= 1e3 ? (step.duration / 1e3).toFixed(2) + "s" : step.duration + "ms" : "\u2014";
    const errHtml = step.errorMessage ? `<div class="step-error">${escapeHtml(step.errorMessage)}</div>` : "";
    const screenshotHtml = step.screenshotPath && fs2.existsSync(step.screenshotPath) ? `<img class="step-screenshot" src="file://${step.screenshotPath}" loading="lazy" />` : "";
    return `<div class="step ${step.status}">
      <div class="step-header">
        <span class="step-icon" style="color:${color}">${icon}</span>
        <span class="step-num">${i + 1}</span>
        <span class="step-action">${escapeHtml(step.action || "")}</span>
        <span class="step-label">${escapeHtml(step.name || "")}</span>
        <span class="step-dur">${dur}</span>
      </div>
      ${errHtml}${screenshotHtml}
    </div>`;
  }).join("\n");
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GhostRun Report \u2014 ${escapeHtml(flow?.name || runId)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#080c10;color:#cdd9e5;font-family:'Segoe UI',system-ui,sans-serif;font-size:15px;line-height:1.6;padding:40px}
h1{font-size:28px;color:#f0f6fc;margin-bottom:6px}
.meta{color:#768390;font-size:13px;margin-bottom:32px}
.summary{display:flex;gap:24px;margin-bottom:32px;flex-wrap:wrap}
.stat{background:#0d1117;border:1px solid #30363d;border-radius:10px;padding:16px 24px}
.stat-val{font-size:26px;font-weight:600;color:${statusColor}}
.stat-label{font-size:12px;color:#768390;text-transform:uppercase;letter-spacing:.05em}
.steps{display:flex;flex-direction:column;gap:8px}
.step{background:#0d1117;border:1px solid #30363d;border-radius:8px;overflow:hidden}
.step.failed{border-color:#f85149}
.step.passed{border-color:#21262d}
.step-header{display:flex;align-items:center;gap:10px;padding:12px 16px;font-family:monospace;font-size:13px}
.step-icon{font-size:16px;min-width:20px}
.step-num{color:#768390;min-width:24px}
.step-action{color:#39d0d8;min-width:140px}
.step-label{color:#f0f6fc;flex:1}
.step-dur{color:#768390;font-size:12px;text-align:right}
.step-error{padding:10px 16px 12px 50px;color:#f85149;font-size:13px;font-family:monospace;background:#160b0b;border-top:1px solid #30363d}
.step-screenshot{width:100%;max-height:400px;object-fit:contain;display:block;border-top:1px solid #30363d;background:#000}
footer{margin-top:48px;color:#768390;font-size:12px}
</style>
</head>
<body>
<h1>${escapeHtml(flow?.name || runId)}</h1>
<div class="meta">Run ID: ${run.id.slice(0, 8)} &nbsp;\xB7&nbsp; ${new Date(run.startedAt).toLocaleString()}</div>
<div class="summary">
  <div class="stat"><div class="stat-val" style="color:${statusColor}">${run.status.toUpperCase()}</div><div class="stat-label">Status</div></div>
  <div class="stat"><div class="stat-val">${durStr}</div><div class="stat-label">Duration</div></div>
  <div class="stat"><div class="stat-val">${steps.filter((s) => s.status === "passed").length}</div><div class="stat-label">Passed</div></div>
  <div class="stat"><div class="stat-val" style="color:${run.status === "failed" ? "#f85149" : "#56d364"}">${steps.filter((s) => s.status === "failed").length}</div><div class="stat-label">Failed</div></div>
</div>
<div class="steps">${stepsHtml}</div>
<footer>Generated by GhostRun \xB7 ${(/* @__PURE__ */ new Date()).toISOString()}</footer>
</body></html>`;
  fs2.writeFileSync(outFile, html);
  success(`HTML report: ${import_chalk.default.cyan(outFile)}`);
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
  console.log("  " + import_chalk.default.cyan("ghostrun serve"));
  console.log();
}
async function runScheduleList() {
  const schedules = db.listSchedules();
  console.log(import_chalk.default.bold("\n  Schedules\n"));
  if (schedules.length === 0) {
    warn("No schedules. Add one: " + import_chalk.default.cyan('ghostrun flow:schedule <id> "<cron>"'));
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
async function runServe(serveArgs = []) {
  const withUI = serveArgs.includes("--ui");
  const portIdx = serveArgs.indexOf("--port");
  const port = portIdx !== -1 ? parseInt(serveArgs[portIdx + 1], 10) || 3e3 : 3e3;
  if (withUI) {
    await runServeDashboard(port);
    return;
  }
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
    info('ghostrun flow:schedule <id> "0 9 * * *"');
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
async function runServeDashboard(port) {
  const http = await import("http");
  const { EventEmitter } = await import("events");
  const logBus = new EventEmitter();
  logBus.setMaxListeners(100);
  const sseClients = /* @__PURE__ */ new Set();
  function broadcast(event, data) {
    const msg = `event: ${event}
data: ${JSON.stringify(data)}

`;
    for (const res of sseClients) {
      try {
        res.write(msg);
      } catch {
      }
    }
  }
  const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>GhostRun Dashboard</title>
<style>
  :root {
    --bg: #080c10;
    --surface: #0d1117;
    --border: #21262d;
    --text: #e6edf3;
    --muted: #8b949e;
    --dim: #6e7681;
    --cyan: #39d0d8;
    --green: #3fb950;
    --red: #f85149;
    --yellow: #d29922;
    --font-mono: 'JetBrains Mono', 'Fira Code', Menlo, monospace;
    --font-ui: system-ui, -apple-system, sans-serif;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-ui);
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  /* NAV */
  nav {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 24px;
    height: 52px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
    flex-shrink: 0;
  }
  .nav-logo { font-size: 20px; }
  .nav-title {
    font-family: var(--font-mono);
    font-size: 15px;
    font-weight: 700;
    color: var(--cyan);
    letter-spacing: -0.5px;
  }
  .nav-title span { color: var(--text); }
  .nav-badge {
    margin-left: auto;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--dim);
    background: rgba(57,208,216,0.08);
    border: 1px solid rgba(57,208,216,0.2);
    border-radius: 4px;
    padding: 2px 8px;
  }
  /* TABS */
  .tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
    padding: 0 24px;
    flex-shrink: 0;
  }
  .tab {
    padding: 10px 18px;
    font-size: 13px;
    cursor: pointer;
    color: var(--muted);
    border-bottom: 2px solid transparent;
    transition: color 0.15s, border-color 0.15s;
    user-select: none;
  }
  .tab:hover { color: var(--text); }
  .tab.active { color: var(--cyan); border-bottom-color: var(--cyan); }
  /* MAIN */
  .main {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 24px;
    gap: 20px;
    overflow-y: auto;
  }
  .panel-hidden { display: none !important; }
  /* STATS ROW */
  .stats-row {
    display: flex;
    gap: 12px;
  }
  .stat-card {
    flex: 1;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px 20px;
  }
  .stat-label {
    font-size: 11px;
    font-family: var(--font-mono);
    color: var(--dim);
    letter-spacing: 1px;
    text-transform: uppercase;
    margin-bottom: 8px;
  }
  .stat-value {
    font-size: 28px;
    font-weight: 700;
    font-family: var(--font-mono);
    line-height: 1;
  }
  .stat-value.cyan { color: var(--cyan); }
  .stat-value.green { color: var(--green); }
  .stat-value.red { color: var(--red); }
  /* SECTION HEADER */
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }
  .section-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--muted);
    font-family: var(--font-mono);
    letter-spacing: 1px;
    text-transform: uppercase;
  }
  /* FLOW TABLE */
  .flow-table {
    width: 100%;
    border-collapse: collapse;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
  }
  .flow-table th {
    text-align: left;
    padding: 10px 16px;
    font-size: 11px;
    font-family: var(--font-mono);
    color: var(--dim);
    letter-spacing: 1px;
    text-transform: uppercase;
    border-bottom: 1px solid var(--border);
    background: rgba(255,255,255,0.02);
  }
  .flow-table td {
    padding: 12px 16px;
    font-size: 13px;
    border-bottom: 1px solid rgba(33,38,45,0.6);
    vertical-align: middle;
  }
  .flow-table tr:last-child td { border-bottom: none; }
  .flow-table tr:hover td { background: rgba(255,255,255,0.02); }
  .flow-name { font-family: var(--font-mono); color: var(--text); font-weight: 600; }
  .flow-steps { color: var(--dim); font-size: 12px; }
  .flow-actions { display: flex; gap: 8px; }
  .btn {
    padding: 5px 12px;
    border-radius: 5px;
    border: 1px solid;
    font-size: 12px;
    font-family: var(--font-mono);
    cursor: pointer;
    transition: background 0.15s, opacity 0.15s;
    background: transparent;
  }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-run { color: var(--green); border-color: rgba(63,185,80,0.3); }
  .btn-run:hover:not(:disabled) { background: rgba(63,185,80,0.1); }
  .btn-delete { color: var(--red); border-color: rgba(248,81,73,0.3); }
  .btn-delete:hover:not(:disabled) { background: rgba(248,81,73,0.08); }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 11px;
    font-family: var(--font-mono);
    font-weight: 600;
  }
  .badge-pass { background: rgba(63,185,80,0.12); color: var(--green); border: 1px solid rgba(63,185,80,0.25); }
  .badge-fail { background: rgba(248,81,73,0.1); color: var(--red); border: 1px solid rgba(248,81,73,0.2); }
  .badge-running { background: rgba(57,208,216,0.1); color: var(--cyan); border: 1px solid rgba(57,208,216,0.2); animation: pulse 1.2s ease-in-out infinite; }
  @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.5 } }
  /* RUNS TABLE */
  .runs-table {
    width: 100%;
    border-collapse: collapse;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
  }
  .runs-table th {
    text-align: left;
    padding: 10px 16px;
    font-size: 11px;
    font-family: var(--font-mono);
    color: var(--dim);
    letter-spacing: 1px;
    text-transform: uppercase;
    border-bottom: 1px solid var(--border);
    background: rgba(255,255,255,0.02);
  }
  .runs-table td {
    padding: 10px 16px;
    font-size: 12.5px;
    font-family: var(--font-mono);
    border-bottom: 1px solid rgba(33,38,45,0.6);
    color: var(--muted);
  }
  .runs-table tr:last-child td { border-bottom: none; }
  /* LIVE LOG */
  .log-container {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    height: 360px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .log-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border);
    background: rgba(255,255,255,0.02);
  }
  .log-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--dim); }
  .log-dot.active { background: var(--green); box-shadow: 0 0 6px rgba(63,185,80,0.5); animation: pulse 1.2s ease-in-out infinite; }
  .log-title { font-family: var(--font-mono); font-size: 12px; color: var(--muted); }
  .log-clear { margin-left: auto; font-size: 11px; color: var(--dim); cursor: pointer; }
  .log-clear:hover { color: var(--muted); }
  .log-body {
    flex: 1;
    padding: 12px 16px;
    overflow-y: auto;
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.7;
    color: var(--muted);
  }
  .log-line { padding: 1px 0; }
  .log-pass { color: var(--green); }
  .log-fail { color: var(--red); }
  .log-info { color: var(--cyan); }
  .log-step { color: var(--text); }
  /* CHAT */
  .chat-container {
    display: flex;
    flex-direction: column;
    height: calc(100vh - 170px);
  }
  .chat-messages {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-bottom: 16px;
  }
  .chat-msg {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }
  .chat-role {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--dim);
    min-width: 52px;
    padding-top: 10px;
    flex-shrink: 0;
  }
  .chat-role.ghost { color: var(--cyan); }
  .chat-bubble {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 13px;
    line-height: 1.65;
    color: var(--text);
    white-space: pre-wrap;
    max-width: 720px;
  }
  .chat-bubble.ghost {
    background: rgba(57,208,216,0.06);
    border-color: rgba(57,208,216,0.2);
  }
  .chat-input-row {
    display: flex;
    gap: 10px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }
  .chat-input {
    flex: 1;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 14px;
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 13px;
    outline: none;
    transition: border-color 0.15s;
  }
  .chat-input:focus { border-color: rgba(57,208,216,0.5); }
  .chat-send {
    padding: 10px 18px;
    background: rgba(57,208,216,0.1);
    border: 1px solid rgba(57,208,216,0.3);
    border-radius: 8px;
    color: var(--cyan);
    font-family: var(--font-mono);
    font-size: 13px;
    cursor: pointer;
    transition: background 0.15s;
  }
  .chat-send:hover { background: rgba(57,208,216,0.18); }
  .chat-send:disabled { opacity: 0.4; cursor: not-allowed; }
  /* Scrollbars */
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
  /* Empty state */
  .empty {
    padding: 40px;
    text-align: center;
    color: var(--dim);
    font-family: var(--font-mono);
    font-size: 13px;
  }
</style>
</head>
<body>
<nav>
  <span class="nav-logo">\u{1F47B}</span>
  <span class="nav-title">Ghost<span>Run</span></span>
  <span class="nav-badge" id="version-badge">v\u2014</span>
</nav>
<div class="tabs">
  <div class="tab active" data-tab="flows">Flows</div>
  <div class="tab" data-tab="runs">Run History</div>
  <div class="tab" data-tab="chat">Chat</div>
</div>
<div class="main">

  <!-- FLOWS TAB -->
  <div id="tab-flows">
    <div id="stats-row" class="stats-row"></div>
    <div>
      <div class="section-header">
        <span class="section-title">Flows</span>
        <span style="font-size:12px;color:var(--dim);font-family:var(--font-mono);" id="flow-count"></span>
      </div>
      <table class="flow-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Steps</th>
            <th>Last Run</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="flow-tbody"></tbody>
      </table>
    </div>
    <div>
      <div class="section-header">
        <span class="section-title">Live Log</span>
      </div>
      <div class="log-container">
        <div class="log-header">
          <div class="log-dot" id="log-dot"></div>
          <span class="log-title" id="log-status">Idle</span>
          <span class="log-clear" onclick="clearLog()">clear</span>
        </div>
        <div class="log-body" id="log-body"><div class="log-line" style="color:var(--dim)">\u2014 waiting for a run \u2014</div></div>
      </div>
    </div>
  </div>

  <!-- RUNS TAB -->
  <div id="tab-runs" class="panel-hidden">
    <div class="section-header"><span class="section-title">Recent Runs</span></div>
    <table class="runs-table">
      <thead>
        <tr><th>Flow</th><th>Status</th><th>Duration</th><th>Steps</th><th>Date</th></tr>
      </thead>
      <tbody id="runs-tbody"></tbody>
    </table>
  </div>

  <!-- CHAT TAB -->
  <div id="tab-chat" class="panel-hidden">
    <div class="chat-container">
      <div class="chat-messages" id="chat-messages">
        <div class="chat-msg">
          <span class="chat-role ghost">Ghost \u203A</span>
          <div class="chat-bubble ghost">\u{1F44B} Hi! I'm your GhostRun assistant. Ask me about your flows, run history, or say "run &lt;flow name&gt;" to execute a flow.</div>
        </div>
      </div>
      <div class="chat-input-row">
        <input class="chat-input" id="chat-input" placeholder="Ask anything about your flows..." />
        <button class="chat-send" id="chat-send" onclick="sendChat()">Send</button>
      </div>
    </div>
  </div>
</div>

<script>
// \u2500\u2500\u2500 Tab switching \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    const id = t.dataset.tab;
    ['flows','runs','chat'].forEach(tab => {
      const el = document.getElementById('tab-' + tab);
      if (tab === id) el.classList.remove('panel-hidden');
      else el.classList.add('panel-hidden');
    });
    if (id === 'runs') loadRuns();
  });
});

// \u2500\u2500\u2500 Load flows \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
async function loadFlows() {
  const r = await fetch('/api/flows');
  const data = await r.json();
  renderStats(data.stats);
  renderFlows(data.flows);
  document.getElementById('version-badge').textContent = 'v' + data.version;
}

function renderStats(stats) {
  const el = document.getElementById('stats-row');
  el.innerHTML = \`
    <div class="stat-card"><div class="stat-label">Total Flows</div><div class="stat-value cyan">\${stats.flows}</div></div>
    <div class="stat-card"><div class="stat-label">Total Runs</div><div class="stat-value">\${stats.runs}</div></div>
    <div class="stat-card"><div class="stat-label">Passed</div><div class="stat-value green">\${stats.passed}</div></div>
    <div class="stat-card"><div class="stat-label">Failed</div><div class="stat-value red">\${stats.failed}</div></div>
  \`;
}

function renderFlows(flows) {
  const tbody = document.getElementById('flow-tbody');
  document.getElementById('flow-count').textContent = flows.length + ' total';
  if (!flows.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">No flows yet. Use <code>ghostrun flow:record</code> to create one.</td></tr>';
    return;
  }
  tbody.innerHTML = flows.map(f => \`
    <tr>
      <td><span class="flow-name">\${f.name}</span></td>
      <td><span class="flow-steps">\${f.steps} steps</span></td>
      <td><span style="color:var(--dim);font-size:12px">\${f.lastRun ? timeAgo(f.lastRun) : '\u2014'}</span></td>
      <td id="status-\${f.id}">\${f.lastStatus ? badgeHtml(f.lastStatus) : '<span style="color:var(--dim)">\u2014</span>'}</td>
      <td>
        <div class="flow-actions">
          <button class="btn btn-run" id="run-btn-\${f.id}" onclick="runFlow('\${f.id}','\${f.name}')">\u25B6 Run</button>
          <button class="btn btn-delete" onclick="deleteFlow('\${f.id}','\${f.name}')">\u2715</button>
        </div>
      </td>
    </tr>
  \`).join('');
}

function badgeHtml(status) {
  if (status === 'passed') return '<span class="badge badge-pass">\u2713 passed</span>';
  if (status === 'failed') return '<span class="badge badge-fail">\u2717 failed</span>';
  if (status === 'running') return '<span class="badge badge-running">\u27F3 running</span>';
  return \`<span style="color:var(--dim)">\${status}</span>\`;
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h/24) + 'd ago';
}

// \u2500\u2500\u2500 Run a flow \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
let activeRun = null;
async function runFlow(id, name) {
  const btn = document.getElementById('run-btn-' + id);
  const statusEl = document.getElementById('status-' + id);
  if (btn) btn.disabled = true;
  if (statusEl) statusEl.innerHTML = badgeHtml('running');
  clearLog();
  appendLog('info', '\u25B6 Starting: ' + name);
  document.getElementById('log-dot').classList.add('active');
  document.getElementById('log-status').textContent = 'Running: ' + name;

  const es = new EventSource('/api/run?id=' + id);
  activeRun = es;
  es.addEventListener('log', e => {
    const d = JSON.parse(e.data);
    appendLog(d.type || 'step', d.message);
  });
  es.addEventListener('done', e => {
    const d = JSON.parse(e.data);
    appendLog(d.passed ? 'pass' : 'fail',
      d.passed ? '\u2713 Flow passed (' + d.duration + 'ms)' : '\u2717 Flow failed: ' + (d.error || 'unknown'));
    if (statusEl) statusEl.innerHTML = badgeHtml(d.passed ? 'passed' : 'failed');
    if (btn) btn.disabled = false;
    document.getElementById('log-dot').classList.remove('active');
    document.getElementById('log-status').textContent = d.passed ? '\u2713 Passed' : '\u2717 Failed';
    es.close();
    activeRun = null;
    loadFlows();
  });
  es.addEventListener('error', () => {
    appendLog('fail', '\u2717 Connection lost');
    if (btn) btn.disabled = false;
    document.getElementById('log-dot').classList.remove('active');
    document.getElementById('log-status').textContent = 'Error';
    es.close();
    activeRun = null;
  });
}

// \u2500\u2500\u2500 Delete flow \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
async function deleteFlow(id, name) {
  if (!confirm('Delete flow "' + name + '"?')) return;
  await fetch('/api/flows/' + id, { method: 'DELETE' });
  loadFlows();
}

// \u2500\u2500\u2500 Load runs \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
async function loadRuns() {
  const r = await fetch('/api/runs');
  const runs = await r.json();
  const tbody = document.getElementById('runs-tbody');
  if (!runs.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">No runs yet.</td></tr>';
    return;
  }
  tbody.innerHTML = runs.map(r => \`
    <tr>
      <td>\${r.flowName || r.flowId}</td>
      <td>\${badgeHtml(r.status)}</td>
      <td>\${r.duration ? r.duration + 'ms' : '\u2014'}</td>
      <td>\${r.stepsTotal || '\u2014'}</td>
      <td>\${r.createdAt ? timeAgo(r.createdAt) : '\u2014'}</td>
    </tr>
  \`).join('');
}

// \u2500\u2500\u2500 Log helpers \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function appendLog(type, msg) {
  const body = document.getElementById('log-body');
  const line = document.createElement('div');
  line.className = 'log-line' + (type === 'pass' ? ' log-pass' : type === 'fail' ? ' log-fail' : type === 'info' ? ' log-info' : ' log-step');
  line.textContent = msg;
  body.appendChild(line);
  body.scrollTop = body.scrollHeight;
}
function clearLog() {
  document.getElementById('log-body').innerHTML = '';
  document.getElementById('log-dot').classList.remove('active');
  document.getElementById('log-status').textContent = 'Idle';
}

// \u2500\u2500\u2500 Chat \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
document.getElementById('chat-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
});

async function sendChat() {
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  sendBtn.disabled = true;

  addChatMsg('you', text);
  const ghostEl = addChatMsg('ghost', '\u2026');

  try {
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: text })
    });
    const data = await r.json();
    ghostEl.textContent = data.reply || '(no response)';
    if (data.runResult) {
      const line = document.createElement('div');
      line.style.cssText = 'margin-top:8px;font-size:11px;font-family:var(--font-mono);color:' + (data.runResult.passed ? 'var(--green)' : 'var(--red)');
      line.textContent = data.runResult.passed ? '\u2713 Flow passed (' + data.runResult.duration + 'ms)' : '\u2717 Flow failed';
      ghostEl.appendChild(line);
    }
  } catch (err) {
    ghostEl.textContent = 'Error: ' + err.message;
  }
  sendBtn.disabled = false;
}

function addChatMsg(role, text) {
  const messages = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg';
  div.innerHTML = '<span class="chat-role ' + (role === 'ghost' ? 'ghost' : '') + '">' + (role === 'ghost' ? 'Ghost \u203A' : 'You   \u203A') + '</span>' +
    '<div class="chat-bubble ' + (role === 'ghost' ? 'ghost' : '') + '"></div>';
  const bubble = div.querySelector('.chat-bubble');
  bubble.textContent = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return bubble;
}

// \u2500\u2500\u2500 Init \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
loadFlows();
setInterval(loadFlows, 10000); // refresh every 10s
</script>
</body>
</html>`;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    const path3 = url.pathname;
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (req.method === "GET" && path3 === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(DASHBOARD_HTML);
      return;
    }
    if (req.method === "GET" && path3 === "/api/flows") {
      const flows = db.listFlows();
      const runs = db.listRuns(void 0, 500);
      const lastRunMap = {};
      for (const r of runs) {
        if (!lastRunMap[r.flowId]) lastRunMap[r.flowId] = r;
      }
      const flowData = flows.map((f) => {
        const lastRun = lastRunMap[f.id];
        const steps = (() => {
          try {
            return JSON.parse(f.graph || "{}").nodes?.length ?? 0;
          } catch {
            return 0;
          }
        })();
        return {
          id: f.id,
          name: f.name,
          steps,
          lastRun: lastRun?.createdAt,
          lastStatus: lastRun?.status
        };
      });
      const passed = runs.filter((r) => r.status === "passed").length;
      const failed = runs.filter((r) => r.status === "failed").length;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        flows: flowData,
        stats: { flows: flows.length, runs: runs.length, passed, failed },
        version: "1.0.0"
      }));
      return;
    }
    if (req.method === "DELETE" && path3.startsWith("/api/flows/")) {
      const id = path3.replace("/api/flows/", "");
      try {
        db.deleteFlow(id);
        res.writeHead(200);
        res.end('{"ok":true}');
      } catch {
        res.writeHead(404);
        res.end('{"error":"not found"}');
      }
      return;
    }
    if (req.method === "GET" && path3 === "/api/runs") {
      const flows = db.listFlows();
      const flowMap = {};
      flows.forEach((f) => {
        flowMap[f.id] = f.name;
      });
      const runs = db.listRuns(void 0, 100);
      const runsWithName = runs.map((r) => ({ ...r, flowName: flowMap[r.flowId] || r.flowId }));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(runsWithName));
      return;
    }
    if (req.method === "GET" && path3 === "/api/run") {
      let sendEvent = function(event, data) {
        res.write(`event: ${event}
data: ${JSON.stringify(data)}

`);
      };
      const flowId = url.searchParams.get("id");
      if (!flowId) {
        res.writeHead(400);
        res.end("Missing id");
        return;
      }
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      });
      const flow = db.getFlow(flowId);
      if (!flow) {
        sendEvent("done", { passed: false, error: "Flow not found", duration: 0 });
        res.end();
        return;
      }
      const startTime = Date.now();
      try {
        const parsedGraph = JSON.parse(flow.graph || "{}");
        const nodes = parsedGraph.nodes || [];
        sendEvent("log", { type: "info", message: `Flow: ${flow.name} (${nodes.length} steps)` });
        const result = await executeFlow(flowId, void 0, {
          onStep: (stepIdx, action, selector) => {
            sendEvent("log", { type: "step", message: `  [${stepIdx + 1}] ${action}${selector ? " \u2192 " + selector : ""}` });
          },
          onError: (msg) => {
            sendEvent("log", { type: "fail", message: "  \u2717 " + msg });
          }
        });
        sendEvent("done", { passed: result.passed, duration: result.duration, error: result.error });
      } catch (err) {
        sendEvent("done", { passed: false, error: err.message, duration: Date.now() - startTime });
      }
      res.end();
      return;
    }
    if (req.method === "POST" && path3 === "/api/chat") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString();
      });
      req.on("end", async () => {
        try {
          const { message } = JSON.parse(body);
          const flows = db.listFlows();
          const runs = db.listRuns(void 0, 20);
          const runMatch = message.toLowerCase().match(/^run\s+(.+)$/);
          if (runMatch) {
            const query = runMatch[1].trim().toLowerCase();
            const found = flows.find((f) => f.name.toLowerCase().includes(query) || f.id === query);
            if (found) {
              try {
                const result = await executeFlow(found.id);
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                  reply: `Running "${found.name}"...`,
                  runResult: { passed: result.passed, duration: result.duration, error: result.error }
                }));
              } catch (err) {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ reply: `Error running flow: ${err.message}`, runResult: { passed: false } }));
              }
              return;
            }
          }
          const flowList = flows.map((f) => `- ${f.name} (id: ${f.id})`).join("\n");
          const recentRuns = runs.slice(0, 10).map((r) => {
            const f = flows.find((fl) => fl.id === r.flowId);
            return `- ${f?.name || r.flowId}: ${r.status} (${r.duration}ms) at ${r.startedAt}`;
          }).join("\n");
          const systemPrompt = `You are GhostRun's assistant. GhostRun is a browser automation CLI tool.
Current flows:
${flowList || "(none)"}
Recent runs:
${recentRuns || "(none)"}
Answer briefly and helpfully. To run a flow, the user can type "run <flow-name>".`;
          let reply = "";
          try {
            const ollamaRes = await fetch("http://localhost:11434/api/chat", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                model: "gemma3:4b",
                stream: false,
                messages: [
                  { role: "system", content: systemPrompt },
                  { role: "user", content: message }
                ]
              }),
              signal: AbortSignal.timeout(15e3)
            });
            const d = await ollamaRes.json();
            reply = d.message?.content || "(no response)";
          } catch {
            const apiKey = process.env.ANTHROPIC_API_KEY;
            if (apiKey) {
              try {
                const Anthropic = (await import("@anthropic-ai/sdk")).default;
                const client = new Anthropic({ apiKey });
                const msg = await client.messages.create({
                  model: "claude-haiku-4-5-20251001",
                  max_tokens: 512,
                  system: systemPrompt,
                  messages: [{ role: "user", content: message }]
                });
                reply = msg.content[0].text || "(no response)";
              } catch {
                reply = "AI is not available. Install Ollama: https://ollama.ai";
              }
            } else {
              reply = "AI is not available. Install Ollama (https://ollama.ai) or set ANTHROPIC_API_KEY.";
            }
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ reply }));
        } catch (err) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }
    res.writeHead(404);
    res.end("Not found");
  });
  server.listen(port, () => {
    printLogo();
    divider();
    console.log(import_chalk.default.bold(`
  Dashboard running at: `) + import_chalk.default.cyan(`http://localhost:${port}`));
    console.log(import_chalk.default.gray("  Press Ctrl+C to stop.\n"));
  });
  process.on("SIGINT", () => {
    console.log("\n  Stopping...");
    server.close();
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
  const humanFlows = flows.filter((f) => f.createdBy === "human").length;
  const agentFlows = flows.filter((f) => f.createdBy === "agent").length;
  console.log(import_chalk.default.bold("\n  Statistics\n"));
  const creatorStr = flows.length > 0 ? import_chalk.default.gray(" (") + import_chalk.default.blue(`${humanFlows} \u{1F464}`) + import_chalk.default.gray(" \xB7 ") + import_chalk.default.magenta(`${agentFlows} \u{1F916}`) + import_chalk.default.gray(")") : "";
  console.log("  " + import_chalk.default.gray("Flows:        ") + import_chalk.default.white(String(flows.length)) + creatorStr);
  console.log("  " + import_chalk.default.gray("Total Runs:   ") + import_chalk.default.white(String(runs.length)));
  console.log("  " + import_chalk.default.gray("Passed:       ") + import_chalk.default.green(String(passed)));
  console.log("  " + import_chalk.default.gray("Failed:       ") + import_chalk.default.red(String(failed)));
  if (runs.length > 0) {
    const rate = Math.round(passed / runs.length * 100);
    const rateColor = rate >= 80 ? import_chalk.default.green : rate >= 50 ? import_chalk.default.yellow : import_chalk.default.red;
    const bar = progressBar(passed, runs.length, 16);
    console.log("  " + import_chalk.default.gray("Success Rate: ") + rateColor(`${rate}%`) + import_chalk.default.gray("  ") + bar);
  }
  if (runs.length > 0) {
    const recent = runs.slice(0, 10).reverse();
    const spark = recent.map((r) => r.status === "passed" ? import_chalk.default.green("\u25AA") : import_chalk.default.red("\u25AA")).join("");
    console.log("  " + import_chalk.default.gray("Last 10 runs: ") + spark);
  }
  console.log();
  console.log("  " + import_chalk.default.gray("Data Path:    ") + import_chalk.default.white(DATA_PATH2));
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
async function bfsCrawl(startUrl, screenshotsDir, maxPages, onProgress) {
  const normalize = (u) => {
    try {
      const parsed = new URL(u);
      return parsed.origin + parsed.pathname.replace(/\/$/, "");
    } catch {
      return u;
    }
  };
  const visited = /* @__PURE__ */ new Set();
  const queued = /* @__PURE__ */ new Set();
  const queue = [normalize(startUrl)];
  queued.add(normalize(startUrl));
  const pages = [];
  const allowedHosts = /* @__PURE__ */ new Set();
  const inputHost = new URL(startUrl).hostname;
  allowedHosts.add(inputHost);
  allowedHosts.add(inputHost.startsWith("www.") ? inputHost.slice(4) : "www." + inputHost);
  const browser = await import_playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
  });
  const page = await context.newPage();
  while (queue.length > 0 && pages.length < maxPages) {
    const url = queue.shift();
    const key = normalize(url);
    if (visited.has(key)) continue;
    visited.add(key);
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 2e4 });
      const actualHost = new URL(page.url()).hostname;
      allowedHosts.add(actualHost);
      allowedHosts.add(actualHost.startsWith("www.") ? actualHost.slice(4) : "www." + actualHost);
      await page.waitForLoadState("networkidle", { timeout: 3e3 }).catch(() => {
      });
      await page.waitForTimeout(500).catch(() => {
      });
      onProgress(pages.length + 1, page.url());
      const title = await page.title().catch(() => "");
      const headings = await page.$$eval(
        "h1,h2,h3",
        (els) => els.slice(0, 8).map((e) => e.innerText.trim()).filter(Boolean)
      ).catch(() => []);
      const links = await page.$$eval(
        "a[href]",
        (els) => els.map((e) => e.href).filter(Boolean)
      ).catch(() => []);
      const sameHostLinks = links.filter((h) => {
        try {
          const u = new URL(h);
          const host = u.hostname;
          const noAsset = !h.match(/\.(pdf|zip|png|jpg|jpeg|gif|svg|ico|css|js|woff|woff2|ttf|mp4|webp)(\?|$)/i);
          const isSameSite = [...allowedHosts].some((ah) => host === ah);
          return isSameSite && noAsset;
        } catch {
          return false;
        }
      });
      const interactives = await page.evaluate(() => {
        function isDynamicId(id) {
          return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || /^[0-9a-f]{16,}$/i.test(id) || /^[a-z]+-[0-9a-f]{6,}$/i.test(id) || /^\d+$/.test(id);
        }
        function bestSelector(el) {
          if (el.id && !isDynamicId(el.id)) return `#${el.id}`;
          const name = el.name;
          if (name) return `${el.tagName.toLowerCase()}[name="${name}"]`;
          const placeholder = el.placeholder;
          if (placeholder) return `${el.tagName.toLowerCase()}[placeholder="${placeholder}"]`;
          const type = el.type;
          if (type && type !== "text") return `${el.tagName.toLowerCase()}[type="${type}"]`;
          const parent = el.parentElement;
          if (parent) {
            const siblings = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
            const idx = siblings.indexOf(el);
            if (idx >= 0) return `${el.tagName.toLowerCase()}:nth-of-type(${idx + 1})`;
          }
          return el.tagName.toLowerCase();
        }
        function labelFor(input) {
          const id = input.id;
          if (id) {
            const lbl = document.querySelector(`label[for="${id}"]`);
            if (lbl) return lbl.innerText.trim();
          }
          const parent = input.closest("label");
          if (parent) {
            const clone = parent.cloneNode(true);
            clone.querySelectorAll("input,textarea,select").forEach((e) => e.remove());
            return clone.innerText.trim();
          }
          const prev = input.previousElementSibling;
          if (prev && prev.tagName === "LABEL") return prev.innerText.trim();
          return "";
        }
        function toField(inp) {
          const type = inp.type || inp.tagName.toLowerCase();
          return {
            type,
            id: inp.id || "",
            name: inp.name || "",
            placeholder: inp.placeholder || "",
            label: labelFor(inp),
            selector: bestSelector(inp),
            required: inp.required || false
          };
        }
        const forms = [];
        document.querySelectorAll("form").forEach((form, fi) => {
          const fields = [];
          form.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), textarea, select').forEach((inp) => {
            fields.push(toField(inp));
          });
          if (fields.length === 0) return;
          const formText = (form.textContent || "").toLowerCase();
          const formAction = (form.action || "").toLowerCase();
          const firstField = fields[0];
          const isSubscribeWidget = fields.length === 1 && firstField.type === "email" && (/subscribe|newsletter|notify/i.test(formText) || /subscribe|newsletter/i.test(formAction) || /subscribe|newsletter/i.test(form.id || "") || /subscribe|newsletter/i.test(firstField.id || "") || /subscribe|newsletter/i.test(firstField.name || "") || /subscribe|newsletter/i.test(firstField.placeholder || "") || /subscribe|newsletter/i.test((form.parentElement?.textContent || "").slice(0, 200).toLowerCase()));
          if (isSubscribeWidget) return;
          const submitBtn = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
          const rawId = form.id && !isDynamicId(form.id) ? form.id : null;
          const formSel = rawId ? `#${rawId}` : form.className ? `form.${form.className.split(" ")[0]}` : `form:nth-of-type(${fi + 1})`;
          forms.push({
            selector: formSel,
            method: form.method || "get",
            fields,
            submitSelector: submitBtn ? bestSelector(submitBtn) : null,
            submitText: submitBtn ? submitBtn.innerText.trim() : "Submit"
          });
        });
        const searchInputs = [];
        document.querySelectorAll('input[type="search"], input[placeholder*="search" i], input[placeholder*="find" i], input[name*="search" i], input[name*="query" i], input[aria-label*="search" i]').forEach((inp) => {
          searchInputs.push(toField(inp));
        });
        const standaloneInputs = [];
        document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="search"])').forEach((inp) => {
          if (!inp.closest("form")) standaloneInputs.push(toField(inp));
        });
        const ctaButtons = [];
        document.querySelectorAll('button, a.btn, a[class*="button"], a[class*="cta"]').forEach((btn) => {
          const text = btn.innerText.trim();
          if (!text || text.length > 60) return;
          if (/menu|close|open|toggle|collapse|expand/i.test(text)) return;
          ctaButtons.push({ text, selector: bestSelector(btn) });
        });
        return { forms, searchInputs, standaloneInputs: standaloneInputs.slice(0, 5), ctaButtons: ctaButtons.slice(0, 8) };
      }).catch(() => ({ forms: [], searchInputs: [], standaloneInputs: [], ctaButtons: [] }));
      const ssPath = path2.join(screenshotsDir, `page-${pages.length + 1}.jpg`);
      await page.screenshot({ path: ssPath, type: "jpeg", quality: 60 }).catch(() => {
      });
      const ssExists = fs2.existsSync(ssPath);
      pages.push({ url: page.url(), title, headings, links: sameHostLinks, screenshotPath: ssExists ? ssPath : null, interactives });
      for (const link of sameHostLinks) {
        const norm = normalize(link);
        if (!visited.has(norm) && !queued.has(norm)) {
          queue.push(norm);
          queued.add(norm);
        }
      }
    } catch {
    }
  }
  await browser.close();
  return pages;
}
function deduplicatePages(pages) {
  function urlPattern(url) {
    try {
      const u = new URL(url);
      const pattern = u.pathname.replace(/\/[a-z0-9_-]+[_-]\d+\/?/g, "/*-N/").replace(/\/\d+\/?/g, "/N/").replace(/\/page-\d+\/?/g, "/page-N/").replace(/\/[0-9a-f]{8,}\/?/g, "/HASH/");
      return u.hostname + pattern;
    } catch {
      return url;
    }
  }
  const seenPatterns = /* @__PURE__ */ new Map();
  for (const p of pages) {
    const pat = urlPattern(p.url);
    const existing = seenPatterns.get(pat);
    if (!existing) {
      seenPatterns.set(pat, p);
    } else {
      const score = (d) => d.interactives.forms.length * 4 + d.interactives.searchInputs.length * 3 + d.interactives.standaloneInputs.length * 2 + d.interactives.ctaButtons.length;
      if (score(p) > score(existing)) seenPatterns.set(pat, p);
    }
  }
  return Array.from(seenPatterns.values());
}
function buildStepsFromInteractives(p) {
  const flows = [];
  const nav = { action: "navigate", url: p.url, label: `Open ${p.title || new URL(p.url).pathname}` };
  if (p.interactives.searchInputs.length > 0) {
    const inp = p.interactives.searchInputs[0];
    flows.push([
      nav,
      { action: "fill", selector: inp.selector, value: "{{searchQuery}}", label: "Enter search query" },
      { action: "keyboard", selector: inp.selector, value: "Enter", label: "Submit search" },
      { action: "assert:visible", selector: "body", label: "Verify results loaded" }
    ]);
  }
  for (const form of p.interactives.forms.slice(0, 2)) {
    if (form.fields.length === 0) continue;
    const steps = [nav];
    for (const f of form.fields) {
      if (f.type === "file") continue;
      const inferredVarName = (() => {
        const t = f.type.toLowerCase();
        const combined = `${f.name} ${f.placeholder} ${f.label}`.toLowerCase();
        if (t === "email" || /email|e-mail/.test(combined)) return "email";
        if (t === "password" || /password|passwd/.test(combined)) return "password";
        if (t === "tel" || /phone|mobile|tel/.test(combined)) return "phone";
        if (/search|query|keyword/.test(combined)) return "searchQuery";
        if (/subject|topic/.test(combined)) return "subject";
        if (/message|comment|feedback|body/.test(combined)) return "message";
        if (/first.?name/.test(combined)) return "firstName";
        if (/last.?name/.test(combined)) return "lastName";
        if (/^name|full.?name|your name/.test(combined)) return "name";
        if (/username|user_name/.test(combined)) return "username";
        if (/address/.test(combined)) return "address";
        if (/city/.test(combined)) return "city";
        if (/zip|postal/.test(combined)) return "zipCode";
        if (/country/.test(combined)) return "country";
        if (/title/.test(combined)) return "title";
        const raw = (f.name || f.label || f.placeholder || f.type).replace(/@.*$/, "");
        return raw.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "value";
      })();
      const varName = inferredVarName;
      const action = f.type === "select" ? "select" : f.type === "checkbox" || f.type === "radio" ? "check" : "fill";
      const scopedSelector = form.selector && !form.selector.startsWith("form:nth") ? f.selector : `${form.selector} ${f.selector}`;
      const usedSelectors = steps.map((s) => s.selector);
      const baseSelector = scopedSelector.trim();
      const dupCount = usedSelectors.filter((s) => s === baseSelector).length;
      const finalSelector = dupCount > 0 ? `${baseSelector}:nth-of-type(${dupCount + 1})` : baseSelector;
      steps.push({
        action,
        selector: finalSelector,
        value: action === "check" || f.type === "radio" ? "true" : `{{${varName}}}`,
        label: f.label || f.name || f.placeholder || f.type
      });
    }
    if (form.submitSelector) {
      const scopedSubmit = form.selector && form.submitSelector ? `${form.selector} ${form.submitSelector}` : form.submitSelector || 'button[type="submit"]';
      steps.push({ action: "click", selector: scopedSubmit.trim(), label: form.submitText || "Submit" });
    }
    steps.push({ action: "assert:visible", selector: "body", label: "Verify submission" });
    const hasInputStep = steps.some((s) => ["fill", "select", "check"].includes(s.action));
    if (hasInputStep) flows.push(steps);
  }
  if (flows.length === 0 && p.interactives.ctaButtons.length > 0) {
    const cta = p.interactives.ctaButtons[0];
    flows.push([
      nav,
      { action: "click", selector: cta.selector, label: `Click "${cta.text}"` },
      { action: "assert:visible", selector: "body", label: "Verify action completed" }
    ]);
  }
  return flows;
}
async function analyzePages(pages) {
  const candidates = [];
  const deduplicated = deduplicatePages(pages);
  const BATCH = 5;
  for (let i = 0; i < deduplicated.length; i += BATCH) {
    const batch = deduplicated.slice(i, i + BATCH);
    const batchResults = await Promise.all(batch.map(async (p) => {
      const stepGroups = buildStepsFromInteractives(p);
      if (stepGroups.length === 0) return [];
      const results = [];
      for (const steps of stepGroups) {
        const stepSummary = steps.map((s) => `${s.action}${s.value ? "(" + s.value + ")" : s.selector ? "(" + s.selector + ")" : ""}`).join(" \u2192 ");
        const interactiveHint = [
          p.interactives.searchInputs.length > 0 ? "has search bar" : "",
          p.interactives.forms.length > 0 ? `has ${p.interactives.forms.length} form(s) with fields: ${p.interactives.forms[0].fields.map((f) => f.label || f.name || f.type).join(", ")}` : "",
          p.interactives.ctaButtons.length > 0 ? `CTAs: ${p.interactives.ctaButtons.slice(0, 3).map((b) => b.text).join(", ")}` : ""
        ].filter(Boolean).join("; ");
        const prompt = `Page: ${p.url}
Title: "${p.title}"
Interactive elements: ${interactiveHint || "none"}
Automation steps: ${stepSummary}

Give this automation flow a short name (3-6 words) and one sentence description.
Reply with ONLY this JSON, nothing else: {"name": "...", "description": "..."}`;
        let name = p.title || new URL(p.url).pathname;
        let description = `Automated interaction on ${p.title || p.url}`;
        const result = await callAI(prompt);
        if (result) {
          try {
            const match = result.text.replace(/```json\n?|\n?```/g, "").match(/\{[^{}]+\}/);
            if (match) {
              const parsed = JSON.parse(match[0]);
              if (typeof parsed.name === "string" && parsed.name.length > 0) name = parsed.name;
              if (typeof parsed.description === "string" && parsed.description.length > 0) description = parsed.description;
            }
          } catch {
          }
        }
        results.push({ name, description, route: p.url, steps });
      }
      return results;
    }));
    for (const r of batchResults) candidates.push(...r);
    if (i + BATCH < deduplicated.length) await new Promise((r) => setTimeout(r, 300));
  }
  return candidates;
}
function generateExploreHtml(report, pages, candidates) {
  const thumbs = pages.map((p, i) => {
    let imgTag = '<div class="no-screenshot">No screenshot</div>';
    if (p.screenshotPath && fs2.existsSync(p.screenshotPath)) {
      const b64 = fs2.readFileSync(p.screenshotPath).toString("base64");
      imgTag = `<img src="data:image/jpeg;base64,${b64}" alt="${p.title}" loading="lazy">`;
    }
    return `
    <div class="page-card">
      <div class="page-thumb">${imgTag}</div>
      <div class="page-info">
        <div class="page-num">#${i + 1}</div>
        <div class="page-title">${escapeHtml(p.title || "(no title)")}</div>
        <a class="page-url" href="${escapeHtml(p.url)}" target="_blank">${escapeHtml(p.url.replace(new URL(report.url).origin, ""))}</a>
        <div class="page-meta">${p.headings.slice(0, 2).map((h) => `<span class="heading-pill">${escapeHtml(h)}</span>`).join("")}</div>
      </div>
    </div>`;
  }).join("");
  const candidateCards = candidates.map((c, i) => {
    const stepsHtml = c.steps && c.steps.length > 0 ? `<div class="flow-steps">
          ${c.steps.map((s, si) => {
      const hasVar = s.value && s.value.includes("{{");
      return `<div class="flow-step">
              <span class="step-num">${si + 1}</span>
              <span class="step-action">${escapeHtml(s.action)}</span>
              ${s.url ? `<span class="step-selector">${escapeHtml(s.url)}</span>` : ""}
              ${s.selector ? `<span class="step-selector">${escapeHtml(s.selector)}</span>` : ""}
              ${s.value ? `<span class="step-value ${hasVar ? "is-var" : ""}">${escapeHtml(s.value)}</span>` : ""}
            </div>`;
    }).join("")}
        </div>` : "";
    return `
    <div class="candidate-card" data-id="${i}">
      <label class="candidate-check">
        <input type="checkbox" class="confirm-cb" data-route="${escapeHtml(c.route)}" data-name="${escapeHtml(c.name)}" checked>
        <span class="candidate-name">${escapeHtml(c.name)}</span>
      </label>
      <div class="candidate-desc">${escapeHtml(c.description || "")}</div>
      <div class="candidate-route">${escapeHtml(c.route)}</div>
      ${stepsHtml}
    </div>`;
  }).join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GhostRun Explore Report \u2014 ${escapeHtml(report.url)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0d1117; color: #c9d1d9; line-height: 1.5; }
  a { color: #58a6ff; }
  .header { background: #161b22; border-bottom: 1px solid #30363d; padding: 24px 32px; display: flex; align-items: center; gap: 16px; }
  .logo { font-size: 22px; font-weight: 700; color: #58a6ff; letter-spacing: -0.5px; }
  .header-meta { font-size: 13px; color: #8b949e; }
  .env-badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-left: 8px; }
  .env-prod { background: #3d0014; color: #ff7b7b; }
  .env-staging { background: #1a2d00; color: #7ee787; }
  .env-preprod { background: #271e00; color: #e3b341; }
  .env-local { background: #0d1d3b; color: #79c0ff; }
  .main { max-width: 1200px; margin: 0 auto; padding: 32px; }
  .section-title { font-size: 18px; font-weight: 600; color: #f0f6fc; margin-bottom: 4px; }
  .section-sub { font-size: 13px; color: #8b949e; margin-bottom: 20px; }
  .stats-row { display: flex; gap: 16px; margin-bottom: 40px; flex-wrap: wrap; }
  .stat-card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px 24px; min-width: 140px; }
  .stat-num { font-size: 28px; font-weight: 700; color: #f0f6fc; }
  .stat-label { font-size: 12px; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }
  section { margin-bottom: 48px; }
  .page-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
  .page-card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; overflow: hidden; }
  .page-thumb { height: 160px; overflow: hidden; background: #0d1117; display: flex; align-items: center; justify-content: center; }
  .page-thumb img { width: 100%; height: 100%; object-fit: cover; object-position: top; }
  .no-screenshot { font-size: 12px; color: #484f58; }
  .page-info { padding: 12px; }
  .page-num { font-size: 11px; color: #484f58; margin-bottom: 4px; }
  .page-title { font-size: 14px; font-weight: 600; color: #f0f6fc; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .page-url { font-size: 12px; color: #58a6ff; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 8px; }
  .page-meta { display: flex; flex-wrap: wrap; gap: 4px; }
  .heading-pill { background: #1f2d3d; color: #79c0ff; font-size: 11px; padding: 2px 6px; border-radius: 4px; white-space: nowrap; overflow: hidden; max-width: 120px; text-overflow: ellipsis; }
  .candidate-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 12px; }
  .candidate-card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; transition: border-color 0.15s; }
  .candidate-card:has(.confirm-cb:checked) { border-color: #238636; }
  .candidate-check { display: flex; align-items: flex-start; gap: 10px; cursor: pointer; }
  .confirm-cb { width: 16px; height: 16px; margin-top: 2px; accent-color: #238636; flex-shrink: 0; cursor: pointer; }
  .candidate-name { font-size: 15px; font-weight: 600; color: #f0f6fc; }
  .candidate-desc { font-size: 13px; color: #8b949e; margin: 8px 0 8px 26px; }
  .candidate-route { font-size: 12px; color: #58a6ff; margin-left: 26px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 10px; }
  .flow-steps { margin: 10px 0 0 0; background: #0d1117; border: 1px solid #21262d; border-radius: 6px; padding: 8px 10px; display: flex; flex-direction: column; gap: 4px; }
  .flow-step { display: flex; align-items: center; gap: 6px; font-size: 11.5px; font-family: monospace; flex-wrap: wrap; }
  .step-num { color: #484f58; min-width: 16px; }
  .step-action { color: #79c0ff; font-weight: 600; }
  .step-selector { color: #8b949e; overflow: hidden; text-overflow: ellipsis; max-width: 200px; white-space: nowrap; }
  .step-value { color: #7ee787; }
  .step-value.is-var { color: #e3b341; font-style: italic; }
  .confirm-bar { position: fixed; bottom: 0; left: 0; right: 0; background: #161b22; border-top: 1px solid #30363d; padding: 16px 32px; display: flex; align-items: center; justify-content: space-between; z-index: 100; }
  .confirm-bar-left { font-size: 14px; color: #8b949e; }
  .confirm-bar-left strong { color: #f0f6fc; }
  .confirm-btn { background: #238636; color: #fff; border: none; border-radius: 6px; padding: 10px 20px; font-size: 14px; font-weight: 600; cursor: pointer; transition: background 0.15s; }
  .confirm-btn:hover { background: #2ea043; }
  .cmd-box { background: #0d1117; border: 1px solid #30363d; border-radius: 6px; padding: 12px 16px; font-family: monospace; font-size: 13px; color: #7ee787; margin-top: 8px; word-break: break-all; }
  .copy-btn { background: #21262d; color: #c9d1d9; border: 1px solid #30363d; border-radius: 6px; padding: 4px 10px; font-size: 12px; cursor: pointer; margin-left: 8px; }
  .copy-btn:hover { background: #30363d; }
  body { padding-bottom: 80px; }
</style>
</head>
<body>
<div class="header">
  <div class="logo">\u26A1 GhostRun</div>
  <div class="header-meta">
    Explore Report \xB7 <a href="${escapeHtml(report.url)}" target="_blank">${escapeHtml(report.url)}</a>
    <span class="env-badge env-${report.environment}">${report.environment}</span>
  </div>
</div>
<div class="main">
  <div class="stats-row">
    <div class="stat-card"><div class="stat-num">${pages.length}</div><div class="stat-label">Pages crawled</div></div>
    <div class="stat-card"><div class="stat-num">${candidates.length}</div><div class="stat-label">Flow candidates</div></div>
    <div class="stat-card"><div class="stat-num">${new Set(pages.map((p) => new URL(p.url).pathname.split("/")[1] || "/")).size}</div><div class="stat-label">Unique sections</div></div>
  </div>

  <section>
    <div class="section-title">Flow Candidates</div>
    <div class="section-sub">AI-suggested flows based on your site's pages. Check the ones you want to save.</div>
    <div class="candidate-grid">${candidateCards}</div>
  </section>

  <section>
    <div class="section-title">Pages Crawled</div>
    <div class="section-sub">${pages.length} page${pages.length !== 1 ? "s" : ""} discovered from <strong>${escapeHtml(report.url)}</strong></div>
    <div class="page-grid">${thumbs}</div>
  </section>

  <section>
    <div class="section-title">Confirm Selected Flows</div>
    <div class="section-sub">After reviewing above, run this command to import selected flows:</div>
    <div class="cmd-box" id="cmd-box">ghostrun explore:confirm ${report.id.slice(0, 8)}<button class="copy-btn" onclick="navigator.clipboard.writeText(document.getElementById('cmd-text').textContent)">Copy</button></div>
    <span id="cmd-text" style="display:none">ghostrun explore:confirm ${report.id.slice(0, 8)}</span>
  </section>
</div>
<div class="confirm-bar">
  <div class="confirm-bar-left"><strong id="selected-count">${candidates.length}</strong> flows selected</div>
  <button class="confirm-btn" onclick="copyConfirmCmd()">Copy confirm command</button>
</div>
<script>
  const cbs = document.querySelectorAll('.confirm-cb');
  const countEl = document.getElementById('selected-count');
  function updateCount() { countEl.textContent = [...cbs].filter(c => c.checked).length; }
  cbs.forEach(cb => cb.addEventListener('change', updateCount));
  function copyConfirmCmd() {
    navigator.clipboard.writeText('ghostrun explore:confirm ${report.id.slice(0, 8)}');
    const btn = document.querySelector('.confirm-btn');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy confirm command'; }, 1500);
  }
</script>
</body>
</html>`;
}
async function runExplore(url) {
  const clack = await import("@clack/prompts");
  const { intro, select, text, password, confirm, spinner, isCancel, outro, note } = clack;
  intro(import_chalk.default.cyan(" GhostRun Explorer "));
  const env = await select({
    message: "Environment type:",
    options: [
      { value: "local", label: "Local", hint: "localhost / 127.0.0.1" },
      { value: "staging", label: "Staging", hint: "staging.yourapp.com" },
      { value: "preprod", label: "Pre-prod", hint: "pre.yourapp.com" },
      { value: "prod", label: "Production", hint: "yourapp.com" }
    ],
    initialValue: url.includes("localhost") || url.includes("127.0.0.1") ? "local" : "prod"
  });
  if (isCancel(env)) {
    outro("Cancelled.");
    return;
  }
  const needsLogin = await confirm({ message: "Does this site require login to explore?" });
  if (isCancel(needsLogin)) {
    outro("Cancelled.");
    return;
  }
  let loginCreds = null;
  if (needsLogin) {
    const username = await text({ message: "Username / email:", validate: (v) => !v ? "Required" : void 0 });
    if (isCancel(username)) {
      outro("Cancelled.");
      return;
    }
    const loginPassword = await password({ message: "Password:", validate: (v) => !v ? "Required" : void 0 });
    if (isCancel(loginPassword)) {
      outro("Cancelled.");
      return;
    }
    loginCreds = { username, loginPassword };
  }
  const maxPagesStr = await text({
    message: "Max pages to crawl:",
    initialValue: "30",
    validate: (v) => !v || isNaN(Number(v)) || Number(v) < 1 ? "Enter a number >= 1" : void 0
  });
  if (isCancel(maxPagesStr)) {
    outro("Cancelled.");
    return;
  }
  const maxPages = Math.min(parseInt(maxPagesStr, 10), 100);
  const report = db.createExploreReport(url, env);
  const exploreDir = path2.join(DATA_PATH2, "explore", report.id);
  fs2.mkdirSync(exploreDir, { recursive: true });
  let cookiesJson = null;
  if (loginCreds) {
    note("A browser will open. Log in, then come back and press Enter.", "Login Required");
    const loginBrowser = await import_playwright.chromium.launch({ headless: false });
    const loginPage = await loginBrowser.newPage();
    await loginPage.goto(url, { waitUntil: "domcontentloaded", timeout: 15e3 }).catch(() => {
    });
    try {
      await loginPage.fill('input[type="email"], input[name="email"], input[name="username"]', loginCreds.username, { timeout: 3e3 });
      await loginPage.fill('input[type="password"]', loginCreds.loginPassword, { timeout: 3e3 });
    } catch {
    }
    await new Promise((resolve) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question(import_chalk.default.cyan("\n  Press Enter once you are logged in... "), () => {
        rl.close();
        resolve();
      });
    });
    const cookies = await loginPage.context().cookies();
    cookiesJson = JSON.stringify(cookies);
    await loginBrowser.close();
  }
  console.log();
  const s = spinner();
  s.start("Crawling pages...");
  let crawlCount = 0;
  const pages = await bfsCrawl(url, exploreDir, maxPages, (visited, current) => {
    crawlCount = visited;
    s.message(`Crawling... ${visited} pages found \u2014 ${new URL(current).pathname}`);
  });
  s.stop(`Crawled ${pages.length} pages`);
  if (pages.length === 0) {
    outro(import_chalk.default.red("No pages could be crawled. Check the URL and try again."));
    return;
  }
  const hasAI = !!await isOllamaRunning() || !!process.env.ANTHROPIC_API_KEY;
  let candidates = [];
  if (hasAI) {
    const s2 = spinner();
    const uniquePageCount = deduplicatePages(pages).length;
    s2.start(`Analyzing ${uniquePageCount} unique page templates (deduped from ${pages.length})...`);
    candidates = await analyzePages(pages);
    s2.stop(`${candidates.length} flow candidates identified from ${uniquePageCount} unique page templates`);
  } else {
    for (const p of deduplicatePages(pages)) {
      for (const steps of buildStepsFromInteractives(p)) {
        const firstInteractive = steps.find((s2) => s2.action !== "navigate" && s2.action !== "assert:visible");
        const name = p.title ? `${p.title} \u2014 ${firstInteractive?.action || "check"}` : `Check ${new URL(p.url).pathname}`;
        candidates.push({ name, description: `Automated flow on ${p.title || p.url}`, route: p.url, steps });
      }
    }
    note("No AI available \u2014 generated flows from detected page elements. Set up Ollama or ANTHROPIC_API_KEY for better names.", "Note");
  }
  const seenRoutes = /* @__PURE__ */ new Set();
  candidates = candidates.filter((c) => {
    if (seenRoutes.has(c.route)) return false;
    seenRoutes.add(c.route);
    return true;
  });
  const seenFingerprints = /* @__PURE__ */ new Set();
  candidates = candidates.filter((c) => {
    const fingerprint = (c.steps || []).filter((s2) => s2.action !== "navigate" && s2.action !== "assert:visible").map((s2) => `${s2.action}:${s2.selector || ""}:${s2.value || ""}`).sort().join("|");
    if (!fingerprint) return true;
    if (seenFingerprints.has(fingerprint)) return false;
    seenFingerprints.add(fingerprint);
    return true;
  });
  for (const c of candidates) {
    const pageForRoute = pages.find((p) => p.url === c.route);
    const steps = c.steps && c.steps.length > 0 ? c.steps : [
      { action: "navigate", url: c.route, label: `Open ${c.name}` },
      { action: "assert:visible", selector: "body", label: "Verify page loaded" }
    ];
    const nodes = steps.map((step, idx) => ({
      id: `n${idx + 1}`,
      type: "action",
      action: step.action,
      ...step.url ? { url: step.url } : {},
      ...step.selector ? { selector: step.selector } : {},
      ...step.value ? { value: step.value } : {},
      name: step.label || `${step.action}${step.selector ? " " + step.selector : ""}`
    }));
    db.createExploreCandidate({
      reportId: report.id,
      name: c.name,
      description: c.description,
      route: c.route,
      screenshotPath: pageForRoute?.screenshotPath || void 0,
      graph: { nodes, edges: [] }
    });
  }
  const s3 = spinner();
  s3.start("Generating report...");
  const reportHtml = generateExploreHtml(report, pages, candidates);
  const reportPath = path2.join(exploreDir, "report.html");
  fs2.writeFileSync(reportPath, reportHtml, "utf-8");
  db.updateExploreReport(report.id, { status: "complete", reportPath });
  s3.stop("Report generated");
  console.log();
  note(
    [
      `  Pages crawled:      ${import_chalk.default.white(String(pages.length))}`,
      `  Flow candidates:    ${import_chalk.default.white(String(candidates.length))}`,
      `  Report:             ${import_chalk.default.cyan(reportPath)}`,
      "",
      `  Open the report in your browser to review candidates,`,
      `  then run:`,
      `    ${import_chalk.default.cyan("ghostrun explore:confirm " + report.id.slice(0, 8))}`
    ].join("\n"),
    "Explore Complete"
  );
  outro("");
}
async function runExploreConfirm(reportId) {
  const clack = await import("@clack/prompts");
  const { intro, multiselect, isCancel, outro, spinner, note } = clack;
  const report = db.findExploreReportByPartialId(reportId);
  if (!report) {
    errorMsg("Report not found: " + reportId);
    process.exit(1);
  }
  const candidates = db.listExploreCandidates(report.id);
  if (candidates.length === 0) {
    warn("No candidates found for this report.");
    return;
  }
  intro(import_chalk.default.cyan(" Confirm Flows "));
  if (report.reportPath) {
    note(`Report: ${import_chalk.default.cyan(report.reportPath)}`, "Tip: open in browser to review with screenshots");
  }
  const chosen = await multiselect({
    message: `Select flows to save (${candidates.length} candidates):`,
    options: candidates.map((c) => ({
      value: c.id,
      label: c.name,
      hint: c.route.replace(report.url, "") || "/"
    })),
    required: false
  });
  if (isCancel(chosen) || chosen.length === 0) {
    outro("No flows saved.");
    return;
  }
  const s = spinner();
  s.start("Saving flows...");
  const selected = chosen;
  for (const id of selected) {
    const c = candidates.find((x) => x.id === id);
    db.createFlow({ name: c.name, description: c.description, appUrl: c.route, graph: JSON.parse(c.graph), createdBy: "agent" });
    db.confirmExploreCandidate(c.id);
  }
  db.updateExploreReport(report.id, { status: "confirmed" });
  s.stop(`${selected.length} flow${selected.length !== 1 ? "s" : ""} saved`);
  const saved = selected.map((id) => candidates.find((c) => c.id === id).name);
  note(
    saved.map((n) => `  ${import_chalk.default.green("\u2713")} ${n}`).join("\n"),
    "Saved Flows"
  );
  note(
    `Run any flow with:
  ${import_chalk.default.cyan("ghostrun run <name>")}`,
    "Next Step"
  );
  outro("");
}
async function runExploreList() {
  const reports = db.listExploreReports();
  if (reports.length === 0) {
    info("No explore sessions found. Run: ghostrun explore <url>");
    return;
  }
  console.log(import_chalk.default.bold("\n  Explore Sessions\n"));
  const header = `  ${"ID".padEnd(10)}${"URL".padEnd(45)}${"Status".padEnd(12)}${"Report"}`;
  console.log(import_chalk.default.gray(header));
  console.log(import_chalk.default.gray("  " + "\u2500".repeat(90)));
  for (const r of reports) {
    const id = import_chalk.default.cyan(r.id.slice(0, 8));
    const url = r.url.slice(0, 43).padEnd(45);
    const status = (r.status === "complete" ? import_chalk.default.green("complete") : import_chalk.default.yellow(r.status)).padEnd(20);
    const report = r.reportPath ? import_chalk.default.gray("open " + r.reportPath) : import_chalk.default.gray("\u2014");
    console.log(`  ${id}  ${url}  ${status}  ${report}`);
  }
  console.log();
  console.log(import_chalk.default.gray(`  Confirm a session: ghostrun explore:confirm <id>`));
  console.log();
}
async function runSuiteCreate(name) {
  const suite = db.createSuite({ name });
  success(`Suite created: ${import_chalk.default.white(suite.name)}`);
  info("ID: " + import_chalk.default.gray(suite.id.slice(0, 8)));
  console.log();
}
async function runSuiteAdd(suiteName, flowName) {
  const suite = db.findSuiteByNameOrId(suiteName);
  if (!suite) {
    errorMsg("Suite not found: " + suiteName);
    process.exit(1);
  }
  const flow = db.findFlowByPartialId(flowName) || db.findFlowByName(flowName);
  if (!flow) {
    errorMsg("Flow not found: " + flowName);
    process.exit(1);
  }
  db.addFlowToSuite(suite.id, flow.id);
  success(`Added "${flow.name}" to suite "${suite.name}"`);
  console.log();
}
async function runSuiteList() {
  const suites = db.listSuites();
  console.log(import_chalk.default.bold("\n  Test Suites\n"));
  if (suites.length === 0) {
    warn("No suites. Create one: " + import_chalk.default.cyan("ghostrun suite:create <name>"));
    console.log();
    return;
  }
  console.log(import_chalk.default.gray("  ID        Name                          Flows"));
  console.log(import_chalk.default.gray("  " + "\u2500".repeat(50)));
  for (const suite of suites) {
    const flows = db.getSuiteFlows(suite.id);
    console.log(`  ${import_chalk.default.gray(suite.id.slice(0, 8))} ${import_chalk.default.white(suite.name.padEnd(28).slice(0, 28))} ${import_chalk.default.gray(String(flows.length))}`);
  }
  console.log();
}
async function runSuiteShow(name) {
  const suite = db.findSuiteByNameOrId(name);
  if (!suite) {
    errorMsg("Suite not found: " + name);
    process.exit(1);
  }
  const flows = db.getSuiteFlows(suite.id);
  console.log(import_chalk.default.bold(`
  Suite: ${suite.name}
`));
  if (flows.length === 0) {
    warn("No flows in this suite.");
    console.log();
    return;
  }
  console.log(import_chalk.default.gray("  #   Flow Name"));
  console.log(import_chalk.default.gray("  " + "\u2500".repeat(44)));
  flows.forEach((f, i) => console.log(`  ${import_chalk.default.gray(String(i + 1).padStart(2))}  ${import_chalk.default.white(f.flowName)}`));
  console.log();
}
async function runSuiteRun(name, vars) {
  printLogo();
  divider();
  const suite = db.findSuiteByNameOrId(name);
  if (!suite) {
    errorMsg("Suite not found: " + name);
    process.exit(1);
  }
  const flows = db.getSuiteFlows(suite.id);
  if (flows.length === 0) {
    warn("No flows in this suite.");
    return;
  }
  console.log(import_chalk.default.bold(`
  Suite: ${suite.name}
`));
  const lineWidth = 45;
  console.log(import_chalk.default.gray("  " + "\u2500".repeat(lineWidth)));
  const results = [];
  const suiteStart = Date.now();
  for (let i = 0; i < flows.length; i++) {
    const sf = flows[i];
    process.stdout.write(`   ${import_chalk.default.gray(String(i + 1))}  ${import_chalk.default.white(sf.flowName.padEnd(22).slice(0, 22))}  `);
    try {
      const result = await executeFlow(sf.flowId, vars);
      const dur = result.duration;
      process.stdout.write(result.passed ? import_chalk.default.green("\u2713") : import_chalk.default.red("\u2717"));
      process.stdout.write("  " + import_chalk.default.gray(dur + "ms") + "\n");
      results.push({ index: i + 1, name: sf.flowName, passed: result.passed, duration: dur });
    } catch (err) {
      process.stdout.write(import_chalk.default.red("\u2717") + "  " + import_chalk.default.gray("error") + "\n");
      results.push({ index: i + 1, name: sf.flowName, passed: false, duration: 0, error: String(err) });
    }
  }
  const totalDuration = Date.now() - suiteStart;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  console.log(import_chalk.default.gray("  " + "\u2500".repeat(lineWidth)));
  console.log();
  console.log(`  ${import_chalk.default.green(passed + "/" + results.length + " passed")}  \xB7 Total: ${import_chalk.default.gray((totalDuration / 1e3).toFixed(1) + "s")}`);
  console.log();
  if (failed > 0) {
    console.log(import_chalk.default.bold("  Failed:"));
    results.filter((r) => !r.passed).forEach((r) => console.log(`    ${import_chalk.default.red("\u2717")} ${import_chalk.default.white(r.name)}${r.error ? " \u2014 " + import_chalk.default.gray(r.error.slice(0, 60)) : ""}`));
    console.log();
    process.exitCode = 1;
  }
}
async function runBaselineSet(id) {
  const flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
  if (!flow) {
    errorMsg("Flow not found: " + id);
    process.exit(1);
  }
  info(`Setting baselines for: ${import_chalk.default.white(flow.name)}`);
  const result = await executeFlow(flow.id);
  if (!result.runId) {
    errorMsg("Flow run failed, no baselines set.");
    return;
  }
  const steps = db.listSteps(result.runId);
  let count = 0;
  const baselinesDir = path2.join(DATA_PATH2, "baselines", flow.id);
  fs2.mkdirSync(baselinesDir, { recursive: true });
  for (const step of steps) {
    if (step.screenshotPath && fs2.existsSync(step.screenshotPath)) {
      const dest = path2.join(baselinesDir, `step-${step.stepNumber}.png`);
      fs2.copyFileSync(step.screenshotPath, dest);
      db.setBaseline(flow.id, step.stepNumber, dest);
      count++;
    }
  }
  success(`Baseline set: ${count} screenshots saved`);
  info(`Path: ${import_chalk.default.cyan(baselinesDir)}`);
  console.log();
}
async function runBaselineClear(id) {
  const flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
  if (!flow) {
    errorMsg("Flow not found: " + id);
    process.exit(1);
  }
  db.clearBaselines(flow.id);
  success(`Baselines cleared for: ${import_chalk.default.white(flow.name)}`);
  console.log();
}
async function runBaselineShow(id) {
  const flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
  if (!flow) {
    errorMsg("Flow not found: " + id);
    process.exit(1);
  }
  const baselines = db.listBaselines(flow.id);
  console.log(import_chalk.default.bold(`
  Baselines: ${flow.name}
`));
  if (baselines.length === 0) {
    warn("No baselines. Run: " + import_chalk.default.cyan("ghostrun baseline:set " + id));
    console.log();
    return;
  }
  for (const b of baselines) {
    console.log(`  Step ${import_chalk.default.gray(String(b.stepNumber).padStart(2))}  ${import_chalk.default.cyan(b.screenshotPath)}  ${import_chalk.default.gray(b.capturedAt.toLocaleDateString())}`);
  }
  console.log();
}
async function runCreate(description) {
  printLogo();
  divider();
  if (!description) {
    description = await askQuestion(import_chalk.default.cyan("\n  Describe the automation flow: "));
    if (!description) {
      errorMsg("Description required");
      process.exit(1);
    }
  }
  const baseUrl = await askQuestion(import_chalk.default.cyan("  Base URL for this flow (e.g. http://localhost:3000): "));
  if (!baseUrl) {
    errorMsg("Base URL required");
    process.exit(1);
  }
  const hasAI = !!await isOllamaRunning() || !!process.env.ANTHROPIC_API_KEY;
  if (!hasAI) {
    errorMsg("No AI provider available. Run Ollama locally or set ANTHROPIC_API_KEY.");
    process.exit(1);
  }
  info("Generating flow from description...");
  const prompt = `Convert this automation test description into a Playwright test flow.

Description: "${description}"
Base URL: "${baseUrl}"

Output ONLY a valid JSON array of steps, no other text:
[
  {"name": "Step name", "action": "navigate|click|fill|select|assert:text|assert:url|assert:element", "url": "...", "selector": "...", "value": "..."}
]

Rules:
- Use "navigate" for page navigation (include full URL)
- Use "click" for button/link clicks (guess a reasonable selector)
- Use "fill" for text inputs (include the test value)
- Use "assert:text" to verify text appears on page
- Use "assert:url" to verify URL contains a string
- Only include fields relevant to each action
- selector and url fields must be CSS selectors or full URLs`;
  const result = await callAI(prompt);
  if (!result) {
    errorMsg("AI failed to generate flow.");
    process.exit(1);
  }
  let steps;
  try {
    const cleaned = result.text.replace(/```json\n?|\n?```/g, "").trim();
    steps = JSON.parse(cleaned);
    if (!Array.isArray(steps)) throw new Error("Not an array");
  } catch {
    errorMsg("AI returned invalid JSON. Try again with a clearer description.");
    console.log(import_chalk.default.gray("  AI response: " + result.text.slice(0, 200)));
    process.exit(1);
    return;
  }
  let flowName = "Generated Flow";
  {
    const nameResult = await callAI(`Give a short (2-5 words) flow name for this automation: "${description}". Reply with ONLY the name, title-cased, no punctuation. Examples: "Login Flow", "Checkout Guest", "Search Products".`);
    if (nameResult?.text) {
      const candidate = nameResult.text.replace(/[^a-zA-Z0-9 ]/g, "").trim().slice(0, 40);
      if (candidate.length >= 3) flowName = candidate;
    }
    if (flowName === "Generated Flow") {
      flowName = description.trim().split(/\s+/).slice(0, 5).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    }
  }
  const nodes = [{ id: "start", type: "start", label: "Start", url: baseUrl }];
  const edges = [];
  let prevId = "start";
  steps.forEach((step, i) => {
    const nodeId = `step-${i + 1}`;
    const node = { id: nodeId, type: "action", label: step.name, action: step.action };
    if (step.url) node.url = step.url;
    if (step.selector) node.selector = step.selector;
    if (step.value) node.value = step.value;
    nodes.push(node);
    edges.push({ id: `e${i}`, source: prevId, target: nodeId });
    prevId = nodeId;
  });
  nodes.push({ id: "end", type: "end", label: "End" });
  edges.push({ id: `e${steps.length}`, source: prevId, target: "end" });
  const flow = db.createFlow({ name: flowName, description, appUrl: baseUrl, graph: { nodes, edges, appUrl: baseUrl }, createdBy: "agent" });
  divider();
  success(`Flow created: ${import_chalk.default.white(flowName)}`);
  info(`Creator: ${import_chalk.default.magenta("\u{1F916} agent")}`);
  info(`Steps: ${import_chalk.default.white(String(steps.length))}`);
  info(`Run with: ${import_chalk.default.green("ghostrun run " + flow.id.slice(0, 8))}`);
  console.log();
}
async function runCodeScan(dir) {
  printLogo();
  divider();
  if (!fs2.existsSync(dir)) {
    errorMsg("Directory not found: " + dir);
    process.exit(1);
  }
  info(`Scanning: ${import_chalk.default.cyan(dir)}`);
  let framework = "Generic";
  if (fs2.existsSync(path2.join(dir, "next.config.js")) || fs2.existsSync(path2.join(dir, "next.config.ts"))) {
    framework = "Next.js";
  } else if (fs2.existsSync(path2.join(dir, "package.json"))) {
    try {
      const pkg = JSON.parse(fs2.readFileSync(path2.join(dir, "package.json"), "utf8"));
      if (pkg.dependencies?.express || pkg.devDependencies?.express) framework = "Express";
    } catch {
    }
  }
  info(`Framework: ${import_chalk.default.cyan(framework)}`);
  const routes = [];
  if (framework === "Next.js") {
    const appDir = path2.join(dir, "app");
    const pagesDir = path2.join(dir, "pages");
    const rootDir = fs2.existsSync(appDir) ? appDir : fs2.existsSync(pagesDir) ? pagesDir : null;
    if (rootDir) {
      const walkDir = (d, base) => {
        for (const entry of fs2.readdirSync(d, { withFileTypes: true })) {
          const full = path2.join(d, entry.name);
          if (entry.isDirectory()) {
            walkDir(full, base);
            continue;
          }
          if (/^(page|route)\.(tsx?|jsx?)$/.test(entry.name)) {
            const rel = path2.dirname(full).replace(base, "").replace(/\\/g, "/") || "/";
            const route = rel || "/";
            if (!routes.includes(route)) routes.push(route);
          }
        }
      };
      walkDir(rootDir, rootDir);
    }
  } else if (framework === "Express") {
    const walkFiles = (d) => {
      const files = [];
      for (const entry of fs2.readdirSync(d, { withFileTypes: true })) {
        const full = path2.join(d, entry.name);
        if (entry.isDirectory() && !["node_modules", ".git", "dist", "build"].includes(entry.name)) {
          files.push(...walkFiles(full));
        } else if (entry.isFile() && /\.(js|ts)$/.test(entry.name)) files.push(full);
      }
      return files;
    };
    for (const file of walkFiles(dir)) {
      try {
        const content = fs2.readFileSync(file, "utf8");
        const matches = content.matchAll(/(?:app|router)\.\w+\(['"]([/][^'"]*)['"]/g);
        for (const m of matches) {
          if (!routes.includes(m[1])) routes.push(m[1]);
        }
      } catch {
      }
    }
  } else {
    const walkFiles = (d) => {
      const files = [];
      for (const entry of fs2.readdirSync(d, { withFileTypes: true })) {
        const full = path2.join(d, entry.name);
        if (entry.isDirectory() && !["node_modules", ".git", "dist", "build"].includes(entry.name)) {
          files.push(...walkFiles(full));
        } else if (entry.isFile() && /\.(js|ts|tsx|jsx)$/.test(entry.name)) files.push(full);
      }
      return files;
    };
    for (const file of walkFiles(dir)) {
      try {
        const content = fs2.readFileSync(file, "utf8");
        const matches = content.matchAll(/['"]([/][a-z][a-z0-9\-/]*)['"]/gi);
        for (const m of matches) {
          if (!routes.includes(m[1])) routes.push(m[1]);
        }
      } catch {
      }
    }
  }
  if (routes.length === 0) {
    warn("No routes discovered. Try a different directory or framework.");
    return;
  }
  const baseUrl = await askQuestion(import_chalk.default.cyan("\n  Base URL for this app? (e.g. http://localhost:3000): "));
  if (!baseUrl) {
    errorMsg("Base URL required");
    process.exit(1);
  }
  console.log(import_chalk.default.bold("\n  Discovered Routes\n"));
  console.log(import_chalk.default.gray("  Route                          Flow"));
  console.log(import_chalk.default.gray("  " + "\u2500".repeat(55)));
  let created = 0;
  for (const route of routes.slice(0, 50)) {
    const fullUrl = baseUrl.replace(/\/$/, "") + route;
    const flowName = `Check ${route}`;
    const nodes = [
      { id: "start", type: "start", label: "Start", url: fullUrl },
      { id: "step-1", type: "action", label: `Navigate to ${route}`, action: "navigate", url: fullUrl },
      { id: "step-2", type: "action", label: `Assert URL contains ${route}`, action: "assert:url", value: route },
      { id: "end", type: "end", label: "End" }
    ];
    const edges = [
      { id: "e0", source: "start", target: "step-1" },
      { id: "e1", source: "step-1", target: "step-2" },
      { id: "e2", source: "step-2", target: "end" }
    ];
    db.createFlow({ name: flowName, appUrl: fullUrl, graph: { nodes, edges, appUrl: fullUrl }, createdBy: "agent" });
    created++;
    console.log(`  ${import_chalk.default.white(route.padEnd(30))} ${import_chalk.default.green("\u2713 " + flowName)}`);
  }
  console.log();
  success(`Found ${routes.length} routes \u2192 created ${created} draft flows`);
  info(`Run: ${import_chalk.default.green("ghostrun flow:list")}`);
  console.log();
}
function getTemplatesDir() {
  const candidates = [
    path2.join(__dirname, "templates"),
    path2.join(process.cwd(), "templates")
  ];
  for (const c of candidates) {
    if (fs2.existsSync(c)) return c;
  }
  return candidates[0];
}
async function runStoreList() {
  const dir = getTemplatesDir();
  if (!fs2.existsSync(dir)) {
    errorMsg("Templates directory not found at " + dir);
    return;
  }
  const files = fs2.readdirSync(dir).filter((f) => f.endsWith(".flow.json"));
  if (files.length === 0) {
    warn("No templates found.");
    return;
  }
  console.log(import_chalk.default.bold("\n  Flow Templates\n"));
  console.log(import_chalk.default.gray("  Name                     Tags                    Variables"));
  console.log(import_chalk.default.gray("  " + "\u2500".repeat(72)));
  for (const file of files) {
    try {
      const t = JSON.parse(fs2.readFileSync(path2.join(dir, file), "utf8"));
      const slug = file.replace(".flow.json", "");
      const tags = (t.tags || []).slice(0, 3).map((g) => import_chalk.default.cyan(g)).join(import_chalk.default.gray(", "));
      const vars = (t.variables || []).map((v) => import_chalk.default.yellow(`{{${v}}}`)).join(import_chalk.default.gray(", "));
      console.log(`  ${import_chalk.default.white(slug.padEnd(24))} ${tags.padEnd(30)} ${vars}`);
      console.log(`  ${import_chalk.default.gray(" ".repeat(24))} ${import_chalk.default.gray(t.description.slice(0, 60))}`);
    } catch {
    }
  }
  console.log();
  console.log(import_chalk.default.gray("  Install with: ghostrun store install <name>"));
  console.log(import_chalk.default.gray("  Variables:   ghostrun run <flow-name> --var BASE_URL=https://..."));
  console.log();
}
async function runStoreInstall(slug) {
  const dir = getTemplatesDir();
  const file = path2.join(dir, slug.endsWith(".flow.json") ? slug : slug + ".flow.json");
  if (!fs2.existsSync(file)) {
    errorMsg(`Template not found: ${slug}`);
    info("Available templates: " + import_chalk.default.cyan("ghostrun store list"));
    process.exit(1);
  }
  let t;
  try {
    t = JSON.parse(fs2.readFileSync(file, "utf8"));
  } catch {
    errorMsg("Invalid template file");
    process.exit(1);
    return;
  }
  const existing = db.findFlowByName(t.flow.name);
  if (existing) {
    warn(`Flow "${t.flow.name}" already installed (id: ${existing.id.slice(0, 8)})`);
    const overwrite = await askQuestion(import_chalk.default.cyan("  Overwrite? (y/N) "));
    if (overwrite.toLowerCase() !== "y") {
      info("Skipped.");
      return;
    }
    db.deleteFlow(existing.id);
  }
  const flow = db.createFlow({ name: t.flow.name, description: t.flow.description, appUrl: t.flow.appUrl, graph: t.flow.graph, createdBy: "agent" });
  divider();
  success(`Template installed: ${import_chalk.default.white(t.flow.name)}`);
  info(`ID: ${import_chalk.default.gray(flow.id.slice(0, 8))}`);
  if (t.variables?.length) {
    console.log();
    console.log(import_chalk.default.bold("  Variables required:\n"));
    for (const v of t.variables) {
      console.log(`  ${import_chalk.default.yellow("{{" + v + "}}")}  \u2192  ${import_chalk.default.gray("--var " + v + "=<value>")}`);
    }
    console.log();
    console.log(import_chalk.default.gray("  Or set them in .ghostrun.env:\n"));
    for (const v of t.variables) {
      console.log(import_chalk.default.gray(`  ${v}=your-value`));
    }
    console.log();
    info(`Run with: ${import_chalk.default.green(`ghostrun run "${t.flow.name}" --var BASE_URL=https://...`)}`);
  } else {
    info(`Run with: ${import_chalk.default.green(`ghostrun run ${flow.id.slice(0, 8)}`)}`);
  }
  console.log();
}
async function runInit() {
  printLogo();
  divider();
  console.log(import_chalk.default.bold("\n  GhostRun Setup Wizard\n"));
  fs2.mkdirSync(path2.join(DATA_PATH2, "data"), { recursive: true });
  fs2.mkdirSync(path2.join(DATA_PATH2, "screenshots"), { recursive: true });
  fs2.mkdirSync(path2.join(DATA_PATH2, "sessions"), { recursive: true });
  success("Data directory ready: " + import_chalk.default.cyan(DATA_PATH2));
  const { execSync } = require("child_process");
  let chromiumOk = false;
  try {
    execSync(`node -e "require('playwright')"`, { stdio: "ignore" });
    chromiumOk = true;
    success("Playwright: installed");
  } catch {
    warn("Playwright not found");
  }
  if (!chromiumOk) {
    const installPw = await askQuestion(import_chalk.default.cyan("  Install Playwright + Chromium? (Y/n) "));
    if (installPw.toLowerCase() !== "n") {
      console.log(import_chalk.default.gray("  Running: npm install playwright...\n"));
      try {
        execSync("npm install playwright", { stdio: "inherit", cwd: __dirname });
        execSync("npx playwright install chromium", { stdio: "inherit" });
        success("Playwright + Chromium installed");
      } catch {
        errorMsg("Installation failed. Run manually: npm install playwright && npx playwright install chromium");
      }
    }
  } else {
    try {
      execSync("npx playwright install chromium --dry-run", { stdio: "ignore" });
    } catch {
      const installBrowser = await askQuestion(import_chalk.default.cyan("  Chromium browser not found. Install it? (Y/n) "));
      if (installBrowser.toLowerCase() !== "n") {
        execSync("npx playwright install chromium", { stdio: "inherit" });
        success("Chromium installed");
      }
    }
  }
  console.log();
  const ollamaModel = await isOllamaRunning();
  if (ollamaModel) {
    success("AI: Ollama running \u2014 " + import_chalk.default.cyan(ollamaModel));
  } else if (process.env.ANTHROPIC_API_KEY) {
    success("AI: Anthropic API key detected");
  } else {
    warn("No AI provider found");
    console.log();
    console.log(import_chalk.default.bold("  Choose an AI provider:\n"));
    console.log(`  ${import_chalk.default.green("A)")} Ollama ${import_chalk.default.gray("(recommended \u2014 free, fully local, no internet needed)")}`);
    console.log(import_chalk.default.gray("     brew install ollama && ollama pull gemma3:4b && ollama serve\n"));
    console.log(`  ${import_chalk.default.cyan("B)")} Anthropic ${import_chalk.default.gray("(cloud \u2014 needs API key)")}`);
    console.log(import_chalk.default.gray("     export ANTHROPIC_API_KEY=sk-ant-...\n"));
    const choice = await askQuestion(import_chalk.default.cyan("  Try to start Ollama now? (y/N) "));
    if (choice.toLowerCase() === "y") {
      try {
        const { spawn: sp } = require("child_process");
        sp("ollama", ["serve"], { detached: true, stdio: "ignore" }).unref();
        await new Promise((r) => setTimeout(r, 2e3));
        const modelCheck = await isOllamaRunning();
        if (modelCheck) success("Ollama started: " + import_chalk.default.cyan(modelCheck));
        else {
          warn("Ollama started but no model found. Pull one:");
          console.log(import_chalk.default.cyan("  ollama pull gemma3:4b"));
        }
      } catch {
        warn("Could not start Ollama. Install it from https://ollama.com");
      }
    }
  }
  console.log();
  const envFile = path2.join(process.cwd(), ".ghostrun.env");
  if (!fs2.existsSync(envFile)) {
    fs2.writeFileSync(envFile, [
      "# GhostRun variables \u2014 used as {{VARIABLE}} in flows",
      "# BASE_URL=https://your-app.com",
      "# EMAIL=test@example.com",
      "# PASSWORD=secret",
      ""
    ].join("\n"));
    info(".ghostrun.env template created in current directory");
  } else {
    info(".ghostrun.env already exists");
  }
  divider();
  console.log(import_chalk.default.bold.green("\n  Setup complete!\n"));
  console.log("  " + import_chalk.default.gray("Record a flow:   ") + import_chalk.default.cyan("ghostrun learn https://your-app.com"));
  console.log("  " + import_chalk.default.gray("Run a flow:      ") + import_chalk.default.cyan("ghostrun run <name>"));
  console.log("  " + import_chalk.default.gray("Run (visible):   ") + import_chalk.default.cyan("ghostrun run <name> --visible"));
  console.log("  " + import_chalk.default.gray("Ask the bot:     ") + import_chalk.default.cyan("ghostrun chat"));
  console.log("  " + import_chalk.default.gray("Browse templates:") + import_chalk.default.cyan("ghostrun store list"));
  console.log();
}
async function runMonitor(flowId) {
  printLogo();
  divider();
  const flow = db.findFlowByPartialId(flowId) || db.findFlowByName(flowId);
  if (!flow) {
    errorMsg("Flow not found: " + flowId);
    process.exit(1);
  }
  const outputIdx = process.argv.indexOf("--output");
  const jsonOutput = outputIdx !== -1 && process.argv[outputIdx + 1] === "json";
  console.log(import_chalk.default.bold("\n  Monitor: ") + import_chalk.default.white(flow.name) + "\n");
  const previousRuns = db.listRuns(flow.id, 2);
  let prevData = {};
  if (previousRuns.length > 0) {
    db.getRunData(previousRuns[0].id).forEach((d) => {
      prevData[d.variableName] = d.variableValue;
    });
  }
  const result = await executeFlow(flow.id, globalVars, { jsonOutput: false, quiet: false });
  const extractedData = result.extractedData;
  if (Object.keys(extractedData).length === 0) {
    console.log();
    warn("No data extracted. Add extract: actions to your flow to capture data.");
    console.log(import_chalk.default.gray("  Flow JSON example:"));
    console.log(import_chalk.default.gray('  { "action": "extract", "variable": "price", "selector": ".price" }'));
    console.log();
    return;
  }
  divider();
  console.log(import_chalk.default.bold("\n  Extracted Data\n"));
  let hasChanges = false;
  for (const [key, value] of Object.entries(extractedData)) {
    const prev = prevData[key];
    if (prev !== void 0 && prev !== value) {
      console.log(`  ${import_chalk.default.yellow("~")} ${import_chalk.default.white(key.padEnd(20))} ${import_chalk.default.gray(prev.slice(0, 40))} ${import_chalk.default.yellow("\u2192")} ${import_chalk.default.yellow(value.slice(0, 40))}`);
      hasChanges = true;
    } else {
      console.log(`  ${import_chalk.default.green("=")} ${import_chalk.default.white(key.padEnd(20))} ${import_chalk.default.cyan(value.slice(0, 60))}`);
    }
  }
  console.log();
  if (Object.keys(prevData).length > 0) {
    if (hasChanges) {
      console.log(import_chalk.default.yellow.bold("  \u26A0 Changes detected since last run"));
    } else {
      console.log(import_chalk.default.green("  \u2713 No changes since last run"));
    }
  } else {
    console.log(import_chalk.default.gray("  (no previous run to compare \u2014 run again to see changes)"));
  }
  if (jsonOutput) {
    console.log("\n" + JSON.stringify({ flowId: flow.id, flowName: flow.name, runId: result.runId, extractedData, hasChanges }, null, 2));
  }
  console.log();
}
async function runChat() {
  printLogo();
  divider();
  const ollamaModel = await isOllamaRunning();
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  if (!ollamaModel && !hasAnthropic) {
    errorMsg("No AI provider available for chat.");
    console.log(import_chalk.default.gray("\n  Option A (free + local): brew install ollama && ollama pull gemma3:4b && ollama serve"));
    console.log(import_chalk.default.gray("  Option B (cloud):        export ANTHROPIC_API_KEY=sk-ant-...\n"));
    process.exit(1);
  }
  const providerLabel = ollamaModel ? import_chalk.default.green(`Ollama (${ollamaModel})`) : import_chalk.default.cyan("Anthropic");
  console.log(import_chalk.default.bold("\n  \u{1F47B} GhostRun Chat\n"));
  console.log("  " + import_chalk.default.gray("Powered by ") + providerLabel + import_chalk.default.gray("  \xB7  type ") + import_chalk.default.cyan("exit") + import_chalk.default.gray(" to quit"));
  console.log("  " + import_chalk.default.gray('Ask about flows, failures, commands, or say "run <flow-name>"'));
  console.log();
  divider();
  function buildSystemPrompt() {
    const flows = db.listFlows();
    const recentRuns = db.listRuns(void 0, 10);
    const flowsList = flows.length > 0 ? flows.map((f) => {
      const stats = db.getFlowStats(f.id);
      return `- "${f.name}" (id:${f.id.slice(0, 8)}, url:${f.appUrl || "N/A"}, ${stats.totalRuns} runs, ${Math.round(stats.passRate * 100)}% pass rate, by:${f.createdBy})`;
    }).join("\n") : "(no flows yet)";
    const runsList = recentRuns.length > 0 ? recentRuns.map((r) => {
      const fl = db.getFlow(r.flowId);
      const dur = r.duration ? `${(r.duration / 1e3).toFixed(1)}s` : "?";
      const when = timeAgo(r.startedAt);
      const note = r.summary ? ` \u2014 ${r.summary.split("\n")[0].slice(0, 60)}` : "";
      return `- ${r.status === "passed" ? "\u2713" : "\u2717"} "${fl?.name || "Unknown"}" ${when} (${dur})${note}`;
    }).join("\n") : "(no runs yet)";
    return `You are GhostRun Assistant \u2014 an embedded AI helper for GhostRun, a memory-driven web automation CLI.

GhostRun lets developers record browser flows and replay them headlessly for testing, monitoring, and data extraction. Uses Playwright + SQLite. AI (Ollama/Anthropic) powers failure analysis, flow generation, and this chat.

## Core Commands
- ghostrun learn <url>          \u2014 Record a flow (real browser)
- ghostrun run <id|name>        \u2014 Run headlessly
- ghostrun run <name> --visible \u2014 Run with visible browser (for debugging)
- ghostrun run <name> --output json \u2014 JSON output with extracted data
- ghostrun flow:list            \u2014 List flows with pass rates
- ghostrun run:list             \u2014 Recent runs
- ghostrun run:show <id>        \u2014 Per-step details + screenshots
- ghostrun run:analyze <id>     \u2014 AI failure analysis
- ghostrun monitor <flow>       \u2014 Run + show extracted data changes
- ghostrun explore <url>        \u2014 BFS crawl + auto-generate flows with AI
- ghostrun create               \u2014 Generate flow from plain English
- ghostrun store list/install   \u2014 Browse + install 10 template flows
- ghostrun suite:create/run     \u2014 Group flows into test suites
- ghostrun chat                 \u2014 This chat interface
- ghostrun init                 \u2014 Setup wizard
- ghostrun status               \u2014 Stats + AI provider info
- ghostrun serve                \u2014 Scheduler daemon (runs cron schedules)
- ghostrun serve --ui           \u2014 Web dashboard at http://localhost:3000

## Flow Actions Supported
navigate, reload, back, forward,
click, dblclick, fill, type, clear, select, check, focus, hover,
drag, keyboard, upload,
wait, wait:text, wait:url, wait:ms,
scroll, scroll:element, scroll:bottom, scroll:load,
next:page,
assert:visible, assert:hidden, assert:text, assert:not-text, assert:value, assert:count, assert:attr,
extract (capture page data to variable),
screenshot, eval, iframe:enter, iframe:exit,
cookie:set, cookie:clear, storage:set

## Variables
Use {{VAR_NAME}} in flows. Pass with --var KEY=value or .ghostrun.env file in CWD.

## Creator Types
\u{1F464} human = recorded live \xB7 \u{1F916} agent = AI-generated (via create/explore/store)

## YOUR FLOWS RIGHT NOW
${flowsList}

## RECENT RUN HISTORY
${runsList}

## Response Rules
1. Be concise and practical \u2014 developers prefer direct answers
2. If asked to RUN an existing flow, write exactly: [RUN: <flow-name>]
3. Only reference flows that actually exist in the list above
4. If asked about a failed run, check the run history summary above
5. To create NEW flows: ghostrun create (AI) or ghostrun learn <url> (browser recording)
6. If you don't know something, say so \u2014 don't invent flow names or IDs`;
  }
  const conversationHistory = [];
  async function* streamResponse(userMessage) {
    conversationHistory.push({ role: "user", content: userMessage });
    if (ollamaModel) {
      const baseUrl = process.env.GHOSTRUN_OLLAMA_URL || "http://localhost:11434";
      let fullResponse = "";
      try {
        const res = await fetch(`${baseUrl}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: ollamaModel,
            messages: [
              { role: "system", content: buildSystemPrompt() },
              ...conversationHistory
            ],
            stream: true
          }),
          signal: AbortSignal.timeout(9e4)
        });
        if (!res.ok || !res.body) {
          yield "(Ollama unavailable \u2014 is it running?)";
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const data = JSON.parse(line);
              const chunk = data.message?.content || "";
              if (chunk) {
                yield chunk;
                fullResponse += chunk;
              }
              if (data.done) {
                conversationHistory.push({ role: "assistant", content: fullResponse });
                return;
              }
            } catch {
            }
          }
        }
        if (fullResponse) conversationHistory.push({ role: "assistant", content: fullResponse });
      } catch (err) {
        yield `
(Error: ${err instanceof Error ? err.message : err})`;
      }
    } else {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      try {
        const msg = await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1024,
          system: buildSystemPrompt(),
          messages: conversationHistory.map((m) => ({ role: m.role, content: m.content }))
        });
        const text = msg.content[0]?.type === "text" ? msg.content[0].text : "(no response)";
        conversationHistory.push({ role: "assistant", content: text });
        yield text;
      } catch (err) {
        yield `(Anthropic error: ${err instanceof Error ? err.message : err})`;
      }
    }
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const askUser = () => new Promise((resolve) => {
    process.stdout.write(import_chalk.default.cyan("\n  You  \u203A "));
    rl.once("line", resolve);
  });
  while (true) {
    let input;
    try {
      input = (await askUser()).trim();
    } catch {
      break;
    }
    if (!input || ["exit", "quit", "q", ":q", "bye"].includes(input.toLowerCase())) {
      console.log(import_chalk.default.gray("\n  Goodbye! \u{1F47B}\n"));
      rl.close();
      break;
    }
    process.stdout.write(import_chalk.default.magenta("  Ghost \u203A "));
    let fullResponse = "";
    for await (const chunk of streamResponse(input)) {
      process.stdout.write(chunk);
      fullResponse += chunk;
    }
    process.stdout.write("\n");
    const runMatch = fullResponse.match(/\[RUN:\s*([^\]]+)\]/i);
    if (runMatch) {
      const flowQuery = runMatch[1].trim();
      const targetFlow = db.findFlowByPartialId(flowQuery) || db.findFlowByName(flowQuery);
      if (targetFlow) {
        process.stdout.write(import_chalk.default.cyan(`
  Run "${targetFlow.name}"? (y/N) `));
        const confirm = await new Promise((resolve) => rl.once("line", resolve));
        if (confirm.trim().toLowerCase() === "y") {
          console.log();
          const result = await executeFlow(targetFlow.id, globalVars);
          console.log();
          const resultSummary = result.passed ? `Flow "${targetFlow.name}" passed in ${result.duration}ms.` : `Flow "${targetFlow.name}" failed in ${result.duration}ms.`;
          conversationHistory.push({ role: "user", content: `[SYSTEM: ${resultSummary}]` });
        }
      } else {
        warn(`Flow not found: "${flowQuery}"`);
      }
    }
  }
}
async function runInteractive() {
  const clack = await import("@clack/prompts");
  const { intro, outro, select, text, confirm, spinner, isCancel, note, log } = clack;
  console.clear();
  printLogo();
  const flows = db.listFlows();
  const runs = db.listRuns(void 0, 100);
  const passed = runs.filter((r) => r.status === "passed").length;
  const failed = runs.length - passed;
  const humanFlows = flows.filter((f) => f.createdBy === "human").length;
  const agentFlows = flows.filter((f) => f.createdBy === "agent").length;
  const ollamaModel = await isOllamaRunning();
  const aiProvider = ollamaModel ? `Ollama (${ollamaModel})` : process.env.ANTHROPIC_API_KEY ? "Anthropic" : "none";
  intro(import_chalk.default.cyan(" GhostRun \u2014 Memory-driven Web Automation "));
  const passRateBar = runs.length > 0 ? progressBar(passed, runs.length, 12) : "";
  const passRatePct = runs.length > 0 ? `  ${Math.round(passed / runs.length * 100)}%` : "";
  const flowsLine = flows.length > 0 ? `  Flows:    ${import_chalk.default.white(String(flows.length))}  (${import_chalk.default.blue(`${humanFlows} \u{1F464}`)}  ${import_chalk.default.magenta(`${agentFlows} \u{1F916}`)})` : `  Flows:    ${import_chalk.default.white("0")}`;
  note(
    [
      flowsLine,
      `  Runs:     ${import_chalk.default.white(String(runs.length))}  ${import_chalk.default.green(String(passed) + " passed")}  ${failed > 0 ? import_chalk.default.red(String(failed) + " failed") : import_chalk.default.gray("0 failed")}`,
      runs.length > 0 ? `  Rate:     ${passRateBar}${import_chalk.default.gray(passRatePct)}` : "",
      `  AI:       ${ollamaModel ? import_chalk.default.green(aiProvider) : process.env.ANTHROPIC_API_KEY ? import_chalk.default.cyan(aiProvider) : import_chalk.default.gray("none \u2014 run Ollama or set ANTHROPIC_API_KEY")}`
    ].filter(Boolean).join("\n"),
    "Status"
  );
  while (true) {
    const action = await select({
      message: "What do you want to do?",
      options: [
        { value: "run", label: "\u25B6  Run a flow", hint: flows.length > 0 ? `${flows.length} saved` : "no flows yet" },
        { value: "record", label: "\u23FA  Record a new flow", hint: "opens real browser" },
        { value: "suite", label: "\u{1F9EA} Run a test suite", hint: "run multiple flows" },
        { value: "reports", label: "\u{1F4CB} View run reports", hint: runs.length > 0 ? `${runs.length} runs` : "no runs yet" },
        { value: "explore", label: "\u{1F50D} Explore a URL", hint: "auto-discover flows with AI" },
        { value: "schedule", label: "\u{1F550} Manage schedules", hint: "cron-based automation" },
        { value: "status", label: "\u{1F4CA} System status", hint: "stats + AI provider" },
        { value: "chat", label: "\u{1F4AC} Ask GhostRun Bot", hint: "Q&A + run flows by name" },
        { value: "serve", label: "\u{1F310}  Open web dashboard", hint: "Local web UI" },
        { value: "exit", label: "\u2715  Exit" }
      ]
    });
    if (isCancel(action) || action === "exit") {
      outro(import_chalk.default.gray("Bye."));
      process.exit(0);
    }
    if (action === "run") {
      const currentFlows = db.listFlows();
      if (currentFlows.length === 0) {
        log.warn("No flows saved yet. Record one first.");
        continue;
      }
      const flowChoice = await select({
        message: "Which flow?",
        options: currentFlows.map((f) => ({
          value: f.id,
          label: f.name,
          hint: f.appUrl || ""
        }))
      });
      if (isCancel(flowChoice)) continue;
      console.log();
      await runFlow(flowChoice);
      console.log();
      await _pause();
    } else if (action === "record") {
      const url = await text({
        message: "URL to record:",
        placeholder: "https://yourapp.com",
        validate: (v) => !v || !v.startsWith("http") ? "Enter a valid URL starting with http" : void 0
      });
      if (isCancel(url)) continue;
      const name = await text({
        message: "Flow name:",
        placeholder: "e.g. Login Flow",
        defaultValue: new URL(url).hostname
      });
      if (isCancel(name)) continue;
      console.log();
      await runLearn(url, name);
    } else if (action === "suite") {
      const suites = db.listSuites();
      if (suites.length === 0) {
        log.warn("No suites. Create one with: ghostrun suite:create <name>");
        continue;
      }
      const { select: sel2, isCancel: isCan2 } = await import("@clack/prompts");
      const suiteChoice = await sel2({
        message: "Which suite?",
        options: suites.map((s) => ({ value: s.id, label: s.name }))
      });
      if (isCan2(suiteChoice)) continue;
      console.log();
      await runSuiteRun(suiteChoice);
      console.log();
      await _pause();
    } else if (action === "reports") {
      const recentRuns = db.listRuns(void 0, 20);
      if (recentRuns.length === 0) {
        log.warn("No runs yet. Run a flow first.");
        continue;
      }
      const runChoice = await select({
        message: "Which run?",
        options: recentRuns.map((r) => {
          const flow = db.getFlow(r.flowId);
          const icon = r.status === "passed" ? import_chalk.default.green("\u2713") : import_chalk.default.red("\u2717");
          const dur = r.duration ? ` ${r.duration}ms` : "";
          return {
            value: r.id,
            label: `${icon}  ${flow?.name || "Unknown"}${dur}`,
            hint: r.id.slice(0, 8)
          };
        })
      });
      if (isCancel(runChoice)) continue;
      console.log();
      await runShowRun(runChoice.slice(0, 8));
      console.log();
      await _pause();
    } else if (action === "explore") {
      const url = await text({
        message: "URL to explore:",
        placeholder: "https://yourapp.com",
        validate: (v) => !v || !v.startsWith("http") ? "Enter a valid URL starting with http" : void 0
      });
      if (isCancel(url)) continue;
      console.log();
      await runExplore(url);
      console.log();
      await _pause();
    } else if (action === "schedule") {
      const schedAction = await select({
        message: "Schedule management:",
        options: [
          { value: "list", label: "List schedules" },
          { value: "add", label: "Add a schedule" },
          { value: "remove", label: "Remove a schedule" },
          { value: "back", label: "\u2190 Back" }
        ]
      });
      if (isCancel(schedAction) || schedAction === "back") continue;
      if (schedAction === "list") {
        console.log();
        await runScheduleList();
        console.log();
        await _pause();
      } else if (schedAction === "add") {
        const currentFlows = db.listFlows();
        if (currentFlows.length === 0) {
          log.warn("No flows to schedule.");
          continue;
        }
        const flowChoice = await select({
          message: "Which flow?",
          options: currentFlows.map((f) => ({ value: f.id, label: f.name }))
        });
        if (isCancel(flowChoice)) continue;
        const cron = await text({
          message: "Cron expression:",
          placeholder: "0 9 * * *  (daily at 9am)",
          validate: (v) => !v ? "Required" : void 0
        });
        if (isCancel(cron)) continue;
        await runScheduleAdd(flowChoice, cron);
      } else if (schedAction === "remove") {
        const schedules = db.listSchedules();
        if (schedules.length === 0) {
          log.warn("No schedules.");
          continue;
        }
        const schedChoice = await select({
          message: "Which schedule?",
          options: schedules.map((s) => ({ value: s.id, label: `${s.name} \u2192 ${s.cronExpression}` }))
        });
        if (isCancel(schedChoice)) continue;
        await runScheduleRemove(schedChoice);
      }
    } else if (action === "chat") {
      console.log();
      await runChat();
    } else if (action === "status") {
      console.log();
      await runStatus();
      console.log();
      await _pause();
    }
  }
}
function _pause() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(import_chalk.default.gray("  Press Enter to continue..."), () => {
      rl.close();
      resolve();
    });
  });
}
async function runApiLearn() {
  printLogo();
  divider();
  console.log(import_chalk.default.bold("\n  API Flow Builder\n"));
  console.log(import_chalk.default.gray("  Build HTTP test flows interactively.\n"));
  const name = await askQuestion(import_chalk.default.cyan("  Flow name: "));
  if (!name.trim()) {
    errorMsg("Name required");
    process.exit(1);
  }
  const nodes = [];
  let stepIdx = 1;
  console.log(import_chalk.default.gray("\n  Add steps. Available types:"));
  console.log(import_chalk.default.gray("  http      \u2014 HTTP request (GET/POST/PUT/DELETE/PATCH)"));
  console.log(import_chalk.default.gray("  assert    \u2014 Assert response (status/body/header/time)"));
  console.log(import_chalk.default.gray("  extract   \u2014 Extract JSON value to variable"));
  console.log(import_chalk.default.gray("  set       \u2014 Set variable"));
  console.log(import_chalk.default.gray("  done      \u2014 Finish and save\n"));
  while (true) {
    const type = (await askQuestion(import_chalk.default.cyan(`  Step ${stepIdx} type [http/assert/extract/set/done]: `))).trim().toLowerCase();
    if (type === "done" || type === "") break;
    if (type === "http") {
      const method = (await askQuestion("    Method [GET]: ")).trim().toUpperCase() || "GET";
      const url = (await askQuestion("    URL: ")).trim();
      if (!url) {
        warn("URL required, skipping.");
        continue;
      }
      const label = (await askQuestion(`    Label [${method} ${url.split("/").slice(-1)[0] || url}]: `)).trim() || `${method} ${url.split("/").slice(-1)[0] || url}`;
      const headersStr = (await askQuestion("    Headers (key:value, comma-sep, or blank): ")).trim();
      const headers = {};
      if (headersStr) {
        for (const h of headersStr.split(",")) {
          const [k, ...v] = h.split(":");
          if (k && v.length) headers[k.trim()] = v.join(":").trim();
        }
      }
      const bodyStr = (await askQuestion("    Body JSON (or blank): ")).trim();
      const extractStr = (await askQuestion("    Extract vars (varName=$.path, comma-sep, or blank): ")).trim();
      const extract = {};
      if (extractStr) {
        for (const e of extractStr.split(",")) {
          const [k, v] = e.split("=");
          if (k && v) extract[k.trim()] = v.trim();
        }
      }
      nodes.push({
        id: (0, import_uuid2.v4)(),
        type: "action",
        action: "http:request",
        method,
        url,
        label,
        headers: Object.keys(headers).length ? headers : void 0,
        body: bodyStr ? JSON.parse(bodyStr) : void 0,
        extract: Object.keys(extract).length ? extract : void 0
      });
    } else if (type === "assert") {
      const assertType = (await askQuestion("    Assert type [status/body:contains/json:path/time]: ")).trim() || "status";
      let node = { id: (0, import_uuid2.v4)(), type: "action", action: "assert:response", assert: assertType, label: `Assert ${assertType}` };
      if (assertType === "status") {
        const exp = (await askQuestion("    Expected status [200]: ")).trim() || "200";
        node = { ...node, expected: Number(exp), label: `Assert status ${exp}` };
      } else if (assertType === "body:contains") {
        const exp = (await askQuestion("    Body must contain: ")).trim();
        node = { ...node, expected: exp, label: `Assert body contains "${exp}"` };
      } else if (assertType === "json:path") {
        const p = (await askQuestion("    JSON path (e.g. $.user.id): ")).trim();
        const exp = (await askQuestion("    Expected value: ")).trim();
        node = { ...node, path: p, expected: exp, label: `Assert ${p} = ${exp}` };
      } else if (assertType === "time") {
        const maxMs = (await askQuestion("    Max response time ms [2000]: ")).trim() || "2000";
        node = { ...node, expected: Number(maxMs), label: `Assert response < ${maxMs}ms` };
      }
      nodes.push(node);
    } else if (type === "extract") {
      const varName = (await askQuestion("    Variable name: ")).trim();
      const p = (await askQuestion("    JSON path (e.g. $.id): ")).trim();
      nodes.push({ id: (0, import_uuid2.v4)(), type: "action", action: "extract:json", variable: varName, path: p, label: `Extract ${varName} from ${p}` });
    } else if (type === "set") {
      const varName = (await askQuestion("    Variable name: ")).trim();
      const val = (await askQuestion("    Value: ")).trim();
      nodes.push({ id: (0, import_uuid2.v4)(), type: "action", action: "set:variable", variable: varName, value: val, label: `Set ${varName} = ${val}` });
    } else {
      warn(`Unknown type "${type}". Try: http, assert, extract, set, done`);
      continue;
    }
    stepIdx++;
  }
  if (!nodes.length) {
    warn("No steps added. Flow not saved.");
    return;
  }
  const flow = db.createFlow({ name, description: `API flow with ${nodes.length} step(s)`, createdBy: "human", graph: { nodes, edges: [], appUrl: void 0 } });
  success(`API flow created: ${import_chalk.default.white(flow.name)} (${import_chalk.default.gray(flow.id.slice(0, 8))})`);
  console.log(import_chalk.default.gray(`  ${nodes.length} step(s). Run with: ghostrun run "${name}"`));
  console.log();
}
async function runEnvCreate(name, extraArgs) {
  printLogo();
  divider();
  let baseUrl = extraArgs[0] || "";
  if (!baseUrl) baseUrl = (await askQuestion(import_chalk.default.cyan("  Base URL (optional, press Enter to skip): "))).trim();
  const env = db.createEnvironment({ name, baseUrl: baseUrl || void 0 });
  success(`Environment created: ${import_chalk.default.white(name)} (${import_chalk.default.gray(env.id.slice(0, 8))})`);
  if (baseUrl) info(`Base URL: ${import_chalk.default.cyan(baseUrl)}`);
  info(`Add variables: ghostrun env:set ${name} KEY value`);
  console.log();
}
async function runEnvList() {
  printLogo();
  divider();
  const envs = db.listEnvironments();
  if (!envs.length) {
    warn("No environments. Create one: ghostrun env:create <name>");
    return;
  }
  console.log(import_chalk.default.bold("\n  Environments\n"));
  for (const e of envs) {
    const active = e.isActive ? import_chalk.default.green(" \u25CF active") : "";
    const varCount = Object.keys(e.variables).length;
    console.log(`  ${import_chalk.default.white(e.name.padEnd(20))}${active}  ${import_chalk.default.gray(varCount + " vars")}${e.baseUrl ? "  " + import_chalk.default.cyan(e.baseUrl) : ""}`);
  }
  console.log();
}
async function runEnvSet(envName, key, value) {
  let env = db.findEnvironmentByName(envName);
  if (!env) {
    env = db.createEnvironment({ name: envName });
    info(`Created environment: ${envName}`);
  }
  const vars = { ...env.variables, [key]: value };
  db.updateEnvironment(env.id, { variables: vars });
  success(`Set ${import_chalk.default.white(key)} = ${import_chalk.default.cyan(value)} in environment ${import_chalk.default.white(envName)}`);
  console.log();
}
async function runEnvUse(envName) {
  const env = db.findEnvironmentByName(envName);
  if (!env) {
    errorMsg(`Environment "${envName}" not found. Create it: ghostrun env:create ${envName}`);
    process.exit(1);
  }
  db.setActiveEnvironment(env.id);
  success(`Active environment: ${import_chalk.default.white(envName)}`);
  if (env.baseUrl) info(`Base URL: ${import_chalk.default.cyan(env.baseUrl)}`);
  const varCount = Object.keys(env.variables).length;
  if (varCount) info(`${varCount} variables loaded`);
  console.log();
}
async function runEnvShow(envName) {
  const env = db.findEnvironmentByName(envName);
  if (!env) {
    errorMsg(`Environment "${envName}" not found`);
    process.exit(1);
  }
  printLogo();
  divider();
  console.log(import_chalk.default.bold(`
  Environment: ${env.name}`) + (env.isActive ? import_chalk.default.green(" \u25CF active") : ""));
  if (env.baseUrl) console.log(`  Base URL: ${import_chalk.default.cyan(env.baseUrl)}`);
  const vars = env.variables;
  if (Object.keys(vars).length === 0) {
    console.log(import_chalk.default.gray("  No variables set."));
  } else {
    console.log(import_chalk.default.bold("\n  Variables:"));
    for (const [k, v] of Object.entries(vars)) {
      const masked = k.toLowerCase().includes("secret") || k.toLowerCase().includes("password") || k.toLowerCase().includes("token") ? "*".repeat(Math.min(v.length, 8)) : v;
      console.log(`    ${import_chalk.default.white(k.padEnd(24))} ${import_chalk.default.cyan(masked)}`);
    }
  }
  console.log();
}
async function runEnvDelete(envName) {
  const env = db.findEnvironmentByName(envName);
  if (!env) {
    errorMsg(`Environment "${envName}" not found`);
    process.exit(1);
  }
  db.deleteEnvironment(env.id);
  success(`Deleted environment: ${envName}`);
  console.log();
}
async function runVarDump(runId) {
  let run = db.findRunByPartialId(runId) || db.getRun(runId);
  if (!run) {
    errorMsg("Run not found: " + runId);
    process.exit(1);
  }
  printLogo();
  divider();
  const data = db.getRunData(run.id);
  const apiResps = db.getApiResponses(run.id);
  console.log(import_chalk.default.bold(`
  Variables from run ${import_chalk.default.gray(run.id.slice(0, 8))}
`));
  if (!data.length) {
    console.log(import_chalk.default.gray("  No variables extracted in this run."));
  } else {
    for (const d of data) {
      console.log(`  Step ${d.stepNumber.toString().padStart(2)}  ${import_chalk.default.white(d.variableName.padEnd(24))} ${import_chalk.default.cyan(d.variableValue.slice(0, 80))}`);
    }
  }
  if (apiResps.length) {
    console.log(import_chalk.default.bold("\n  API Calls:\n"));
    for (const r of apiResps) {
      const statusColor = r.statusCode && r.statusCode < 400 ? import_chalk.default.green : import_chalk.default.red;
      console.log(`  Step ${r.stepNumber.toString().padStart(2)}  ${import_chalk.default.white((r.method || "???").padEnd(7))} ${import_chalk.default.gray(r.url.slice(0, 60))}  ${r.statusCode ? statusColor(String(r.statusCode)) : import_chalk.default.red("ERR")}  ${r.responseTimeMs ? import_chalk.default.gray(r.responseTimeMs + "ms") : ""}`);
    }
  }
  console.log();
}
function parsePerfArgs(extraArgs) {
  const get = (flag, def) => {
    const idx = extraArgs.indexOf(flag);
    if (idx === -1) return def;
    const raw = extraArgs[idx + 1] || "";
    return parseInt(raw.replace(/[^0-9]/g, "")) || def;
  };
  const getDurationMs = (flag, defSec) => {
    const idx = extraArgs.indexOf(flag);
    if (idx === -1) return defSec * 1e3;
    const raw = extraArgs[idx + 1] || String(defSec);
    const num = parseInt(raw.replace(/[^0-9]/g, "")) || defSec;
    if (raw.endsWith("ms")) return num;
    return num * 1e3;
  };
  return {
    vus: get("--vus", 10),
    duration: getDurationMs("--duration", 30),
    rampUp: getDurationMs("--ramp-up", 5),
    timeout: getDurationMs("--timeout", 10)
  };
}
function renderPerfStats(stats, checksTotal, checksFailed, perStep, flowName, config) {
  const errColor = stats.errorRate > 5 ? import_chalk.default.red : stats.errorRate > 1 ? import_chalk.default.yellow : import_chalk.default.green;
  const p95Color = stats.p95 > 1e3 ? import_chalk.default.red : stats.p95 > 500 ? import_chalk.default.yellow : import_chalk.default.green;
  const checkPassRate = checksTotal > 0 ? parseFloat(((checksTotal - checksFailed) / checksTotal * 100).toFixed(1)) : 100;
  const checkColor = checksFailed > 0 ? import_chalk.default.red : import_chalk.default.green;
  divider();
  console.log(import_chalk.default.bold.white("\n  PERFORMANCE RESULTS") + import_chalk.default.gray(` \u2014 ${flowName}`));
  console.log(import_chalk.default.gray(`  VUs: ${config.vus}  Duration: ${config.duration / 1e3}s  Ramp-up: ${config.rampUp / 1e3}s
`));
  const w = 46;
  const line = (label, val) => `  \u2502  ${label.padEnd(22)}${val.padStart(w - 26)}  \u2502`;
  console.log(`  \u250C${"\u2500".repeat(w)}\u2510`);
  console.log(`  \u2502  ${"Summary".padEnd(w - 2)}\u2502`);
  console.log(`  \u251C${"\u2500".repeat(w)}\u2524`);
  console.log(line("HTTP Requests", import_chalk.default.white(stats.total.toLocaleString())));
  console.log(line("Throughput", import_chalk.default.cyan(stats.avgRps + " req/s")));
  console.log(line("HTTP Success", import_chalk.default.green(`${(100 - stats.errorRate).toFixed(1)}%  (${stats.success.toLocaleString()})`)));
  console.log(line("HTTP Errors", errColor(`${stats.errorRate}%  (${stats.failed.toLocaleString()})`)));
  if (checksTotal > 0) {
    console.log(line("Checks Passed", checkColor(`${checkPassRate}%  (${(checksTotal - checksFailed).toLocaleString()} / ${checksTotal.toLocaleString()})`)));
    if (checksFailed > 0) console.log(line("Checks Failed", import_chalk.default.red(`${checksFailed.toLocaleString()} assertion failures`)));
  }
  console.log(`  \u251C${"\u2500".repeat(w)}\u2524`);
  console.log(`  \u2502  ${"Latency".padEnd(w - 2)}\u2502`);
  console.log(`  \u251C${"\u2500".repeat(w)}\u2524`);
  console.log(line("p50  (median)", import_chalk.default.green(stats.p50 + "ms")));
  console.log(line("p95", p95Color(stats.p95 + "ms")));
  console.log(line("p99", stats.p99 > 2e3 ? import_chalk.default.red(stats.p99 + "ms") : import_chalk.default.yellow(stats.p99 + "ms")));
  console.log(line("min / max", import_chalk.default.gray(`${stats.min}ms / ${stats.max}ms`)));
  console.log(`  \u2514${"\u2500".repeat(w)}\u2518`);
  const stepNames = Object.keys(perStep);
  if (stepNames.length > 1) {
    console.log(import_chalk.default.bold("\n  Per Step:\n"));
    console.log(import_chalk.default.gray(`  ${"Step".padEnd(38)} ${"Req".padStart(6)} ${"p50".padStart(7)} ${"p95".padStart(7)} ${"Err%".padStart(6)}`));
    console.log(import_chalk.default.gray("  " + "\u2500".repeat(68)));
    for (const [label, s] of Object.entries(perStep)) {
      const errPct = s.errorRate;
      const errStr = errPct > 0 ? import_chalk.default.red(errPct.toFixed(1) + "%") : import_chalk.default.green("0%");
      const p95Str = s.p95 > 500 ? import_chalk.default.yellow(s.p95 + "ms") : import_chalk.default.green(s.p95 + "ms");
      const truncLabel = label.length > 37 ? label.slice(0, 34) + "..." : label;
      console.log(`  ${import_chalk.default.white(truncLabel.padEnd(38))} ${s.total.toString().padStart(6)} ${String(s.p50 + "ms").padStart(7)} ${p95Str.padStart(7)} ${errStr.padStart(6)}`);
    }
  }
  console.log();
}
async function runPerfRun(flowId, extraArgs) {
  const config = parsePerfArgs(extraArgs);
  printLogo();
  divider();
  let flow = db.findFlowByPartialId(flowId) || db.findFlowByName(flowId);
  if (!flow) {
    errorMsg("Flow not found: " + flowId);
    process.exit(1);
  }
  console.log(import_chalk.default.bold(`
  Load Test: ${import_chalk.default.white(flow.name)}`));
  console.log(import_chalk.default.gray(`  VUs: ${config.vus}  Duration: ${config.duration / 1e3}s  Ramp-up: ${config.rampUp / 1e3}s  Timeout: ${config.timeout / 1e3}s
`));
  const startTime = Date.now();
  const totalMs = config.duration;
  const progressInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const pct = Math.min(100, Math.round(elapsed / totalMs * 100));
    const filled = Math.round(pct / 5);
    const bar = "\u2588".repeat(filled) + "\u2591".repeat(20 - filled);
    process.stdout.write(`\r  [${bar}] ${pct}%  ${Math.round(elapsed / 1e3)}s / ${config.duration / 1e3}s  `);
  }, 250);
  let stats, checksTotal, checksFailed, perStep, perfRunId;
  try {
    ({ stats, checksTotal, checksFailed, perStep, perfRunId } = await runPerfTest(flowId, config));
  } finally {
    clearInterval(progressInterval);
    process.stdout.write("\r" + " ".repeat(60) + "\r");
  }
  renderPerfStats(stats, checksTotal, checksFailed, perStep, flow.name, config);
  info("Perf Run ID: " + import_chalk.default.gray(perfRunId.slice(0, 8)));
  info("View details: " + import_chalk.default.cyan(`ghostrun perf:show ${perfRunId.slice(0, 8)}`));
  console.log();
}
async function runPerfExport(flowId, extraArgs) {
  const config = parsePerfArgs(extraArgs);
  const p95 = parseInt((extraArgs[extraArgs.indexOf("--p95") + 1] || "").replace(/[^0-9]/g, "") || "500");
  const errRate = parseFloat(extraArgs[extraArgs.indexOf("--max-errors") + 1] || "1");
  const outputFlag = extraArgs.indexOf("--output");
  const outputFile = outputFlag !== -1 ? extraArgs[outputFlag + 1] : "";
  let flow = db.findFlowByPartialId(flowId) || db.findFlowByName(flowId);
  if (!flow) {
    errorMsg("Flow not found: " + flowId);
    process.exit(1);
  }
  const graph = JSON.parse(flow.graph);
  const API_ONLY = /* @__PURE__ */ new Set([
    "http:request",
    "assert:response",
    "assert:status",
    "assert:body",
    "assert:header",
    "assert:time",
    "set:variable",
    "extract:json",
    "env:switch"
  ]);
  const actionNodes = (graph.nodes || []).filter((n) => n.type === "action" && API_ONLY.has(n.action));
  if (!actionNodes.length) {
    errorMsg("No API steps found. perf:export only supports API flows.");
    process.exit(1);
  }
  const script = generateK6Script(flow.name, actionNodes, {
    vus: config.vus,
    duration: config.duration,
    p95threshold: p95,
    errorThreshold: errRate
  });
  const filename = outputFile || `${flow.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-k6.js`;
  fs2.writeFileSync(filename, script, "utf8");
  printLogo();
  divider();
  success(`k6 script exported: ${import_chalk.default.cyan(filename)}`);
  console.log();
  console.log(import_chalk.default.bold("  Thresholds:"));
  info(`p95 response time < ${p95}ms`);
  info(`error rate < ${errRate}%`);
  console.log();
  console.log(import_chalk.default.bold("  Run with k6:"));
  console.log(import_chalk.default.gray(`    k6 run ${filename}`));
  console.log(import_chalk.default.gray(`    k6 run --vus ${config.vus} --duration ${config.duration / 1e3}s ${filename}`));
  console.log(import_chalk.default.gray(`    k6 run --out json=results.json ${filename}`));
  console.log();
  console.log(import_chalk.default.gray("  Install k6: https://grafana.com/docs/k6/latest/get-started/installation/"));
  console.log();
  console.log(import_chalk.default.bold("  Script preview:"));
  console.log(import_chalk.default.gray("  " + "\u2500".repeat(56)));
  script.split("\n").slice(0, 30).forEach((l) => console.log(import_chalk.default.gray("  ") + import_chalk.default.white(l)));
  if (script.split("\n").length > 30) console.log(import_chalk.default.gray(`  ... (${script.split("\n").length - 30} more lines)`));
  console.log();
}
async function runPerfList() {
  printLogo();
  divider();
  const runs = db.listPerfRuns();
  if (!runs.length) {
    warn("No perf runs yet. Run: ghostrun perf:run <flow-name>");
    return;
  }
  console.log(import_chalk.default.bold("\n  Performance Runs\n"));
  console.log(import_chalk.default.gray(`  ${"ID".padEnd(10)} ${"Flow".padEnd(26)} ${"VUs".padStart(4)} ${"Duration".padStart(9)} ${"RPS".padStart(7)} ${"p95".padStart(7)} ${"Err%".padStart(6)}  When`));
  console.log(import_chalk.default.gray("  " + "\u2500".repeat(82)));
  for (const r of runs) {
    const cfg = r.config;
    const errColor = (r.failedRequests ?? 0) / Math.max(r.totalRequests ?? 1, 1) > 0.05 ? import_chalk.default.red : import_chalk.default.green;
    const errPct = r.totalRequests ? ((r.failedRequests ?? 0) / r.totalRequests * 100).toFixed(1) : "\u2014";
    const p95Str = r.p95 != null ? r.p95 > 500 ? import_chalk.default.yellow(r.p95 + "ms") : import_chalk.default.green(r.p95 + "ms") : "\u2014";
    console.log(
      `  ${import_chalk.default.gray(r.id.slice(0, 8).padEnd(10))} ${import_chalk.default.white(r.flowName.slice(0, 25).padEnd(26))} ${String(cfg?.vus ?? "?").padStart(4)} ${String((cfg?.duration ?? 0) / 1e3 + "s").padStart(9)} ${import_chalk.default.cyan(String(r.avgRps ?? "\u2014").padStart(7))} ${p95Str.padStart(7)} ${errColor(errPct + "%").padStart(6)}  ${timeAgo(r.startedAt.toISOString())}`
    );
  }
  console.log();
}
async function runPerfShow(runId) {
  const run = db.findPerfRunByPartialId(runId);
  if (!run) {
    errorMsg("Perf run not found: " + runId);
    process.exit(1);
  }
  const cfg = run.config;
  if (run.p50 != null) {
    const stats = {
      total: run.totalRequests ?? 0,
      success: run.successRequests ?? 0,
      failed: run.failedRequests ?? 0,
      errorRate: run.totalRequests ? parseFloat(((run.failedRequests ?? 0) / run.totalRequests * 100).toFixed(1)) : 0,
      avgRps: run.avgRps ?? 0,
      p50: run.p50 ?? 0,
      p95: run.p95 ?? 0,
      p99: run.p99 ?? 0,
      min: run.minMs ?? 0,
      max: run.maxMs ?? 0
    };
    renderPerfStats(stats, 0, 0, run.perStepStats || {}, run.flowName, cfg);
  } else {
    warn("Perf run has no stats (may have failed or is still running).");
  }
  info("Started: " + import_chalk.default.gray(run.startedAt.toISOString()));
  if (run.completedAt) info("Completed: " + import_chalk.default.gray(run.completedAt.toISOString()));
  console.log();
}
async function runPerfCompare(id1, id2) {
  const r1 = db.findPerfRunByPartialId(id1);
  const r2 = db.findPerfRunByPartialId(id2);
  if (!r1) {
    errorMsg("First perf run not found: " + id1);
    process.exit(1);
  }
  if (!r2) {
    errorMsg("Second perf run not found: " + id2);
    process.exit(1);
  }
  const c1 = JSON.parse(r1.config ? JSON.stringify(r1.config) : "{}");
  const c2 = JSON.parse(r2.config ? JSON.stringify(r2.config) : "{}");
  divider();
  console.log(import_chalk.default.bold("\n  Performance Comparison\n"));
  console.log(`  ${import_chalk.default.cyan("A")} ${r1.id.slice(0, 8)}  ${import_chalk.default.gray(r1.flowName)}  ${import_chalk.default.gray(timeAgo(r1.startedAt.toISOString()))}  ${r1.config ? import_chalk.default.gray(`(${c1.vus}VU \xB7 ${c1.duration}s)`) : ""}`);
  console.log(`  ${import_chalk.default.cyan("B")} ${r2.id.slice(0, 8)}  ${import_chalk.default.gray(r2.flowName)}  ${import_chalk.default.gray(timeAgo(r2.startedAt.toISOString()))}  ${r2.config ? import_chalk.default.gray(`(${c2.vus}VU \xB7 ${c2.duration}s)`) : ""}`);
  console.log();
  function delta(a, b, unit = "ms", lowerBetter = true) {
    if (a == null || b == null) return import_chalk.default.gray("\u2014");
    const diff = b - a;
    const pct = a !== 0 ? (diff / a * 100).toFixed(1) : "\u2014";
    const better = lowerBetter ? diff < 0 : diff > 0;
    const color = diff === 0 ? import_chalk.default.gray : better ? import_chalk.default.green : import_chalk.default.red;
    const sign = diff > 0 ? "+" : "";
    return color(`${sign}${diff.toFixed(0)}${unit} (${sign}${pct}%)`);
  }
  const col = (s) => String(s).padEnd(14);
  const hdr = (s) => import_chalk.default.bold.gray(String(s).padEnd(14));
  console.log(`  ${import_chalk.default.gray("Metric".padEnd(20))} ${hdr("A")} ${hdr("B")} ${"Change".padEnd(20)}`);
  console.log(import_chalk.default.gray("  " + "\u2500".repeat(72)));
  const rows = [
    ["Avg RPS", r1.avgRps, r2.avgRps, " req/s", false],
    ["p50 latency", r1.p50, r2.p50, "ms", true],
    ["p95 latency", r1.p95, r2.p95, "ms", true],
    ["p99 latency", r1.p99, r2.p99, "ms", true],
    ["Min latency", r1.minMs, r2.minMs, "ms", true],
    ["Max latency", r1.maxMs, r2.maxMs, "ms", true]
  ];
  for (const [label, v1, v2, unit, lowerBetter] of rows) {
    const a = v1 != null ? v1.toFixed(unit === " req/s" ? 1 : 0) + unit : "\u2014";
    const b = v2 != null ? v2.toFixed(unit === " req/s" ? 1 : 0) + unit : "\u2014";
    console.log(`  ${label.padEnd(20)} ${col(a)} ${col(b)} ${delta(v1 ?? null, v2 ?? null, unit, lowerBetter)}`);
  }
  const sr1 = r1.totalRequests ? ((r1.successRequests || 0) / r1.totalRequests * 100).toFixed(1) + "%" : "\u2014";
  const sr2 = r2.totalRequests ? ((r2.successRequests || 0) / r2.totalRequests * 100).toFixed(1) + "%" : "\u2014";
  const srGood = parseFloat(sr2) >= parseFloat(sr1);
  console.log(`  ${"HTTP Success".padEnd(20)} ${col(sr1)} ${col(sr2)} ${sr1 === "\u2014" || sr2 === "\u2014" ? import_chalk.default.gray("\u2014") : srGood ? import_chalk.default.green("\u2265 A") : import_chalk.default.red("< A")}`);
  console.log();
  const p95Improved = r1.p95 && r2.p95 && r2.p95 < r1.p95;
  const p95Worse = r1.p95 && r2.p95 && r2.p95 > r1.p95 * 1.1;
  if (p95Improved) console.log(import_chalk.default.green("  \u2713 B is faster \u2014 p95 improved by " + Math.abs(r2.p95 - r1.p95).toFixed(0) + "ms"));
  else if (p95Worse) console.log(import_chalk.default.red("  \u2717 B is slower \u2014 p95 degraded by " + Math.abs(r2.p95 - r1.p95).toFixed(0) + "ms"));
  else console.log(import_chalk.default.gray("  ~ Performance roughly equivalent"));
  console.log();
}
async function generatePerfReport(perfRunId, outFile) {
  const pr = db.getPerfRun ? db.getPerfRun(perfRunId) : null;
  if (!pr) return;
  const config = pr.config ? typeof pr.config === "string" ? JSON.parse(pr.config) : pr.config : {};
  const perStep = pr.perStepStats ? typeof pr.perStepStats === "string" ? Object.values(JSON.parse(pr.perStepStats)) : Object.values(pr.perStepStats) : [];
  const stepsHtml = perStep.map((s) => {
    const p95Color = Number(s.p95) > 500 ? "#f85149" : Number(s.p95) > 200 ? "#e3b341" : "#56d364";
    return `<tr>
      <td>${escapeHtml(String(s.label || ""))}</td>
      <td>${String(s.total || s.count || 0)}</td>
      <td>${Number(s.p50 || 0).toFixed(0)}ms</td>
      <td style="color:${p95Color}">${Number(s.p95 || 0).toFixed(0)}ms</td>
      <td>${Number(s.p99 || 0).toFixed(0)}ms</td>
      <td>${Number(s.min || 0).toFixed(0)}ms</td>
      <td>${Number(s.max || 0).toFixed(0)}ms</td>
    </tr>`;
  }).join("\n");
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GhostRun Perf \u2014 ${escapeHtml(pr.flowName)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#080c10;color:#cdd9e5;font-family:'Segoe UI',system-ui,sans-serif;font-size:15px;line-height:1.6;padding:40px}
h1{font-size:28px;color:#f0f6fc;margin-bottom:6px}
.meta{color:#768390;font-size:13px;margin-bottom:32px}
.summary{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:16px;margin-bottom:40px}
.stat{background:#0d1117;border:1px solid #30363d;border-radius:10px;padding:16px 20px}
.stat-val{font-size:24px;font-weight:600;color:#f0f6fc}
.stat-val.good{color:#56d364}.stat-val.warn{color:#e3b341}.stat-val.bad{color:#f85149}
.stat-label{font-size:11px;color:#768390;text-transform:uppercase;letter-spacing:.07em;margin-top:4px}
table{width:100%;border-collapse:collapse}
th,td{padding:10px 14px;text-align:left;border-bottom:1px solid #21262d;font-size:13px}
th{color:#768390;font-weight:500;text-transform:uppercase;font-size:11px;letter-spacing:.07em}
tr:last-child td{border-bottom:none}
.section-title{font-size:16px;font-weight:600;color:#f0f6fc;margin:32px 0 12px}
footer{margin-top:48px;color:#768390;font-size:12px}
</style>
</head>
<body>
<h1>${escapeHtml(pr.flowName)}</h1>
<div class="meta">
  Perf Run ${pr.id.slice(0, 8)} &nbsp;\xB7&nbsp; ${config.vus || "?"} VUs \xB7 ${config.duration || "?"}s \xB7 ramp-up ${config.rampUp || 0}s
  &nbsp;\xB7&nbsp; ${new Date(pr.startedAt).toLocaleString()}
</div>
<div class="summary">
  <div class="stat"><div class="stat-val ${pr.status === "done" ? "good" : "bad"}">${(pr.status || "unknown").toUpperCase()}</div><div class="stat-label">Status</div></div>
  <div class="stat"><div class="stat-val">${pr.totalRequests || 0}</div><div class="stat-label">HTTP Requests</div></div>
  <div class="stat"><div class="stat-val ${pr.totalRequests && pr.successRequests === pr.totalRequests ? "good" : "warn"}">${pr.totalRequests ? ((pr.successRequests || 0) / pr.totalRequests * 100).toFixed(1) + "%" : "\u2014"}</div><div class="stat-label">Success Rate</div></div>
  <div class="stat"><div class="stat-val">${pr.avgRps ? pr.avgRps.toFixed(1) : "\u2014"}</div><div class="stat-label">Avg RPS</div></div>
  <div class="stat"><div class="stat-val">${pr.p50 != null ? pr.p50 + "ms" : "\u2014"}</div><div class="stat-label">p50</div></div>
  <div class="stat"><div class="stat-val ${pr.p95 && pr.p95 > 500 ? "bad" : pr.p95 && pr.p95 > 200 ? "warn" : "good"}">${pr.p95 != null ? pr.p95 + "ms" : "\u2014"}</div><div class="stat-label">p95</div></div>
  <div class="stat"><div class="stat-val">${pr.p99 != null ? pr.p99 + "ms" : "\u2014"}</div><div class="stat-label">p99</div></div>
  <div class="stat"><div class="stat-val">${pr.minMs != null ? pr.minMs + "ms" : "\u2014"}</div><div class="stat-label">Min</div></div>
  <div class="stat"><div class="stat-val">${pr.maxMs != null ? pr.maxMs + "ms" : "\u2014"}</div><div class="stat-label">Max</div></div>
</div>
<div class="section-title">Per-step breakdown</div>
<table>
  <thead><tr><th>Step</th><th>Count</th><th>p50</th><th>p95</th><th>p99</th><th>Min</th><th>Max</th></tr></thead>
  <tbody>${stepsHtml}</tbody>
</table>
<footer>Generated by GhostRun \xB7 ${(/* @__PURE__ */ new Date()).toISOString()}</footer>
</body></html>`;
  fs2.writeFileSync(outFile, html);
  success(`HTML report: ${import_chalk.default.cyan(outFile)}`);
}
var args = process.argv.slice(2);
var cmd = args[0];
var globalVars = parseVars(process.argv.slice(2));
var db = new DatabaseManager();
async function main() {
  if (!cmd) {
    await runInteractive();
    db.close();
    return;
  }
  if (cmd === "--version" || cmd === "-v") {
    const realBin = fs2.realpathSync(process.argv[1]);
    const pkgPath = path2.join(path2.dirname(realBin), "package.json");
    const pkg = JSON.parse(fs2.readFileSync(pkgPath, "utf8"));
    console.log(pkg.version);
    process.exit(0);
  }
  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    printLogo();
    divider();
    console.log();
    const C = (s) => import_chalk.default.cyan(s.padEnd(34));
    const G = (s) => import_chalk.default.gray(s);
    const H = (s) => {
      console.log(import_chalk.default.bold.white("  " + s));
      console.log(import_chalk.default.gray("  " + "\u2500".repeat(55)));
    };
    H("Record & Run");
    console.log(`  ${C("learn <url> [name]")}${G("Record a new flow (opens real browser)")}`);
    console.log(`  ${C("run <id|name> [--var k=v]")}${G("Execute a flow headlessly")}`);
    console.log(`  ${C("run <id> --visible")}${G("Run with visible browser window")}`);
    console.log(`  ${C("run <id> --output json")}${G("JSON output with extracted data")}`);
    console.log(`  ${C("run <id> --report html")}${G("Run flow + save HTML report")}`);
    console.log(`  ${C("create [description]")}${G("Generate flow from natural language  \u{1F916} AI")}`);
    console.log(`  ${C("code:scan <directory>")}${G("Scan codebase, create draft flows    \u{1F916} AI")}`);
    console.log();
    H("Flow Management");
    console.log(`  ${C("flow:list")}${G("List all flows with creator + pass rate")}`);
    console.log(`  ${C("flow:fix <id|name>")}${G("Interactively repair broken selectors")}`);
    console.log(`  ${C("flow:delete <id|name>")}${G("Delete a flow")}`);
    console.log(`  ${C("flow:export <id|name>")}${G("Export flow to .flow.json")}`);
    console.log(`  ${C("flow:import <file>")}${G("Import flow from .flow.json")}`);
    console.log(`  ${C("flow:rename <id|name> <new>")}${G("Rename a flow")}`);
    console.log(`  ${C("flow:clone <id|name>")}${G("Duplicate a flow")}`);
    console.log(`  ${C("flow:from-curl [cmd]")}${G("Parse curl command \u2192 create flow")}`);
    console.log(`  ${C("flow:from-spec <file>")}${G("Import OpenAPI/Swagger JSON or YAML spec")}`);
    console.log();
    H("Scheduling");
    console.log(`  ${C('flow:schedule <id> "<cron>"')}${G('Schedule a flow  e.g. "0 9 * * *"')}`);
    console.log(`  ${C("schedule:list")}${G("List all schedules")}`);
    console.log(`  ${C("schedule:remove <id>")}${G("Remove a schedule")}`);
    console.log(`  ${C("serve")}${G("Start the scheduler daemon")}`);
    console.log(`  ${C("serve --ui [--port 3000]")}${G("Launch the web dashboard")}`);
    console.log();
    H("Test Suites");
    console.log(`  ${C("suite:create <name>")}${G("Create a test suite")}`);
    console.log(`  ${C("suite:add <suite> <flow>")}${G("Add a flow to a suite")}`);
    console.log(`  ${C("suite:list")}${G("List all suites")}`);
    console.log(`  ${C("suite:show <suite>")}${G("Show flows in a suite")}`);
    console.log(`  ${C("suite:run <suite> [--var k=v]")}${G("Run all flows in a suite")}`);
    console.log();
    H("Visual Baselines");
    console.log(`  ${C("baseline:set <flow-id>")}${G("Capture reference screenshots")}`);
    console.log(`  ${C("baseline:clear <flow-id>")}${G("Clear baselines for a flow")}`);
    console.log(`  ${C("baseline:show <flow-id>")}${G("List baseline screenshots")}`);
    console.log();
    H("Run History & Analysis");
    console.log(`  ${C("run:list")}${G("List recent runs with status + timing")}`);
    console.log(`  ${C("run:show <id>")}${G("Full step details + screenshots")}`);
    console.log(`  ${C("run:diff <id1> <id2>")}${G("Pixel-diff screenshots between two runs")}`);
    console.log(`  ${C("run:analyze <id>")}${G("Plain-English failure analysis          \u{1F916} AI")}`);
    console.log();
    H("Template Store");
    console.log(`  ${C("store list")}${G("Browse 10+ ready-made flow templates")}`);
    console.log(`  ${C("store install <name>")}${G("Install a template (sets {{variables}})")}`);
    console.log();
    H("Data Extraction & Monitoring");
    console.log(`  ${C("monitor <id|name>")}${G("Run flow + show extracted data changes")}`);
    console.log(`  ${C("monitor <id> --output json")}${G("Monitor with JSON output")}`);
    console.log(import_chalk.default.gray(`  ${"  Flow actions: extract, scroll:bottom, scroll:load, next:page".padEnd(52)}`));
    console.log();
    H("API Testing");
    console.log(`  ${C("api:learn")}${G("Build HTTP API test flow interactively")}`);
    console.log(`  ${C("env:create <name>")}${G("Create environment (dev/staging/prod)")}`);
    console.log(`  ${C("env:list")}${G("List all environments")}`);
    console.log(`  ${C("env:set <env> <key> <val>")}${G("Set variable in environment")}`);
    console.log(`  ${C("env:use <name>")}${G("Activate environment for runs")}`);
    console.log(`  ${C("env:show <name>")}${G("Show environment variables")}`);
    console.log(`  ${C("var:dump <run-id>")}${G("Show extracted variables + API calls from run")}`);
    console.log();
    H("Load & Performance Testing");
    console.log(`  ${C("perf:run <flow> [opts]")}${G("Run load test  --vus 20 --duration 30s")}`);
    console.log(`  ${C("perf:export <flow> [opts]")}${G("Export k6 script  --p95 500 --max-errors 1")}`);
    console.log(`  ${C("perf:list")}${G("List past performance runs")}`);
    console.log(`  ${C("perf:show <run-id>")}${G("Show detailed stats for a perf run")}`);
    console.log(`  ${C("perf:compare <id-A> <id-B>")}${G("Side-by-side comparison of two perf runs")}`);
    console.log(`  ${C("perf:run <flow> --report html")}${G("Run load test + save HTML report")}`);
    console.log(import_chalk.default.gray(`  ${"  Options: --vus N  --duration Ns  --ramp-up Ns  --timeout Ns".padEnd(52)}`));
    console.log();
    H("Chat & Setup");
    console.log(`  ${C("chat")}${G("Ask GhostRun Bot \u2014 Q&A + run flows      \u{1F916} AI")}`);
    console.log(`  ${C("init")}${G("Setup wizard (Chromium + AI provider)")}`);
    console.log();
    H("Exploration & System");
    console.log(`  ${C("explore <url>")}${G("Auto-discover flows via BFS crawl       \u{1F916} AI")}`);
    console.log(`  ${C("explore:list")}${G("List all explore sessions")}`);
    console.log(`  ${C("explore:confirm <report-id>")}${G("Save confirmed flows from explore")}`);
    console.log(`  ${C("status")}${G("Stats, creator breakdown, AI provider")}`);
    console.log(`  ${C("serve")}${G("Open web dashboard (ghostrun serve --ui)")}`);
    console.log();
    console.log(import_chalk.default.gray("  \u{1F916} AI  = enhanced by AI (Ollama local or ANTHROPIC_API_KEY)"));
    console.log(import_chalk.default.gray("  \u{1F464}     = human-recorded   \u{1F916} = agent/AI-generated"));
    console.log(import_chalk.default.gray("  Flags:     --visible (show browser)  --output json  --var key=value"));
    console.log();
    process.exit(0);
  }
  switch (cmd) {
    case "init":
      await runInit();
      break;
    case "chat":
      await runChat();
      break;
    case "monitor":
      if (!args[1]) {
        errorMsg("Flow ID or name required");
        process.exit(1);
      }
      await runMonitor(args[1]);
      break;
    case "learn":
      if (!args[1]) {
        errorMsg("URL required");
        process.exit(1);
      }
      await runLearn(args[1]);
      break;
    case "run": {
      if (!args[1]) {
        errorMsg("Flow ID or name required");
        process.exit(1);
      }
      const reportFlag = args.indexOf("--report");
      const reportFmt = reportFlag >= 0 ? args[reportFlag + 1] || "html" : null;
      const reportOut = (() => {
        const i = args.indexOf("--output");
        return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") && args[i + 1] !== "json" ? args[i + 1] : null;
      })();
      const savedRunId = await runFlow(args[1], globalVars);
      if (reportFmt && savedRunId) {
        const outFile = reportOut || `ghostrun-report-${savedRunId.slice(0, 8)}.html`;
        await generateRunReport(savedRunId, outFile);
      }
      break;
    }
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
    case "flow:rename":
      if (!args[1] || !args[2]) {
        errorMsg("Usage: flow:rename <id|name> <new-name>");
        process.exit(1);
      }
      await runRenameFlow(args[1], args.slice(2).join(" "));
      break;
    case "flow:clone":
      if (!args[1]) {
        errorMsg("Flow ID or name required");
        process.exit(1);
      }
      await runCloneFlow(args[1]);
      break;
    case "flow:from-curl":
      await runFlowFromCurl(args[1]);
      break;
    case "flow:from-spec":
      if (!args[1]) {
        errorMsg("File path required");
        process.exit(1);
      }
      await runFlowFromSpec(args[1]);
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
      await runServe(args.slice(1));
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
    case "explore":
      if (!args[1]) {
        errorMsg("URL required");
        process.exit(1);
      }
      await runExplore(args[1]);
      break;
    case "explore:list":
      await runExploreList();
      break;
    case "explore:confirm":
      if (!args[1]) {
        errorMsg("Report ID required");
        process.exit(1);
      }
      await runExploreConfirm(args[1]);
      break;
    // case 'app': removed - desktop app is deprecated, use web dashboard instead
    case "status":
      await runStatus();
      break;
    case "suite:create":
      if (!args[1]) {
        errorMsg("Suite name required");
        process.exit(1);
      }
      await runSuiteCreate(args[1]);
      break;
    case "suite:add":
      if (!args[1] || !args[2]) {
        errorMsg("Usage: suite:add <suite> <flow>");
        process.exit(1);
      }
      await runSuiteAdd(args[1], args[2]);
      break;
    case "suite:list":
      await runSuiteList();
      break;
    case "suite:show":
      if (!args[1]) {
        errorMsg("Suite name or ID required");
        process.exit(1);
      }
      await runSuiteShow(args[1]);
      break;
    case "suite:run":
      if (!args[1]) {
        errorMsg("Suite name or ID required");
        process.exit(1);
      }
      await runSuiteRun(args[1], globalVars);
      break;
    case "baseline:set":
      if (!args[1]) {
        errorMsg("Flow ID or name required");
        process.exit(1);
      }
      await runBaselineSet(args[1]);
      break;
    case "baseline:clear":
      if (!args[1]) {
        errorMsg("Flow ID or name required");
        process.exit(1);
      }
      await runBaselineClear(args[1]);
      break;
    case "baseline:show":
      if (!args[1]) {
        errorMsg("Flow ID or name required");
        process.exit(1);
      }
      await runBaselineShow(args[1]);
      break;
    case "create":
      await runCreate(args[1]);
      break;
    case "code:scan":
      if (!args[1]) {
        errorMsg("Directory required");
        process.exit(1);
      }
      await runCodeScan(args[1]);
      break;
    case "store":
      if (args[1] === "list" || !args[1]) {
        await runStoreList();
      } else if (args[1] === "install") {
        if (!args[2]) {
          errorMsg("Template name required. Run: ghostrun store list");
          process.exit(1);
        }
        await runStoreInstall(args[2]);
      } else {
        errorMsg("Unknown store command. Use: store list / store install <name>");
        process.exit(1);
      }
      break;
    case "store:list":
      await runStoreList();
      break;
    case "store:install":
      if (!args[1]) {
        errorMsg("Template name required. Run store:list to see options.");
        process.exit(1);
      }
      await runStoreInstall(args[1]);
      break;
    case "api:learn":
      await runApiLearn();
      break;
    case "perf:run": {
      if (!args[1]) {
        errorMsg("Flow ID or name required");
        process.exit(1);
      }
      const perfExtraArgs = args.slice(2);
      await runPerfRun(args[1], perfExtraArgs);
      const perfReportFlag = perfExtraArgs.indexOf("--report");
      if (perfReportFlag >= 0) {
        const perfRuns = db.listPerfRuns();
        const latestPerfRun = perfRuns[0];
        if (latestPerfRun) {
          const perfOutIdx = perfExtraArgs.indexOf("--output");
          const perfOutFile = perfOutIdx >= 0 && perfExtraArgs[perfOutIdx + 1] && !perfExtraArgs[perfOutIdx + 1].startsWith("--") ? perfExtraArgs[perfOutIdx + 1] : `ghostrun-perf-${latestPerfRun.id.slice(0, 8)}.html`;
          await generatePerfReport(latestPerfRun.id, perfOutFile);
        }
      }
      break;
    }
    case "perf:export":
      if (!args[1]) {
        errorMsg("Flow ID or name required");
        process.exit(1);
      }
      await runPerfExport(args[1], args.slice(2));
      break;
    case "perf:list":
      await runPerfList();
      break;
    case "perf:show":
      if (!args[1]) {
        errorMsg("Perf run ID required");
        process.exit(1);
      }
      await runPerfShow(args[1]);
      break;
    case "perf:compare":
      if (!args[1] || !args[2]) {
        errorMsg("Usage: perf:compare <run-id-A> <run-id-B>");
        process.exit(1);
      }
      await runPerfCompare(args[1], args[2]);
      break;
    case "env:create":
      if (!args[1]) {
        errorMsg("Environment name required");
        process.exit(1);
      }
      await runEnvCreate(args[1], args.slice(2));
      break;
    case "env:list":
      await runEnvList();
      break;
    case "env:set":
      if (!args[1] || !args[2] || !args[3]) {
        errorMsg("Usage: env:set <env-name> <key> <value>");
        process.exit(1);
      }
      await runEnvSet(args[1], args[2], args[3]);
      break;
    case "env:use":
      if (!args[1]) {
        errorMsg("Environment name required");
        process.exit(1);
      }
      await runEnvUse(args[1]);
      break;
    case "env:show":
      if (!args[1]) {
        errorMsg("Environment name required");
        process.exit(1);
      }
      await runEnvShow(args[1]);
      break;
    case "env:delete":
      if (!args[1]) {
        errorMsg("Environment name required");
        process.exit(1);
      }
      await runEnvDelete(args[1]);
      break;
    case "var:dump":
      if (!args[1]) {
        errorMsg("Run ID required");
        process.exit(1);
      }
      await runVarDump(args[1]);
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
