/*
 * Copyright (c) 2012 Oleksiy Krivoshey
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

/**
* This class provides simple LZ77 compression and decompression.
*
* @author Olle Tšrnstršm olle[at]studiomediatech[dot]com
* @created 2009-02-18
*/


var LZ77 = function(_settings){
    this.init(_settings);
}
LZ77.prototype = {
    init: function(_settings){
        var settings = settings || {};
        
        this.referencePrefix = "`";
        this.referenceIntBase = settings.referenceIntBase || 96;
        this.referenceIntFloorCode = " ".charCodeAt(0);
        this.referenceIntCeilCode = this.referenceIntFloorCode + this.referenceIntBase - 1;
        this.maxStringDistance = Math.pow(this.referenceIntBase, 2) - 1;
        this.minStringLength = settings.minStringLength || 5;
        this.maxStringLength = Math.pow(this.referenceIntBase, 1) - 1 + this.minStringLength;
        this.defaultWindowLength = settings.defaultWindowLength || 144;
        this.maxWindowLength = this.maxStringDistance + this.minStringLength;
    },
	
    encodeReferenceInt: function (value, width) {
        if ((value >= 0) && (value < (Math.pow(this.referenceIntBase, width) - 1))) {
            var encoded = "";
            while (value > 0) {
                encoded = (String.fromCharCode((value % this.referenceIntBase) + this.referenceIntFloorCode)) + encoded;
                value = Math.floor(value / this.referenceIntBase);
            }
            var missingLength = width - encoded.length;
            for (var i = 0; i < missingLength; i++) {
                encoded = String.fromCharCode(this.referenceIntFloorCode) + encoded;
            }
            return encoded;
        } else {
            throw "Reference int out of range: " + value + " (width = " + width + ")";
        }
    },
	
    encodeReferenceLength: function (length) {
        return this.encodeReferenceInt(length - this.minStringLength, 1);
    },
	
    decodeReferenceInt: function (data, width) {
        var value = 0;
        for (var i = 0; i < width; i++) {
            value *= this.referenceIntBase;
            var charCode = data.charCodeAt(i);
            if ((charCode >= this.referenceIntFloorCode) && (charCode <= this.referenceIntCeilCode)) {
                value += charCode - this.referenceIntFloorCode;
            } else {
                throw "Invalid char code in reference int: " + charCode;
            }
        }
        return value;
    },
	
    decodeReferenceLength: function (data) {
        return this.decodeReferenceInt(data, 1) + this.minStringLength;
    },
	
    // PUBLIC
	
    /**
	* Compress data using the LZ77 algorithm.
	*
	* @param data
	* @param windowLength
	*/
    compress: function (data, windowLength) {
        windowLength = windowLength || this.defaultWindowLength;
        if (windowLength > this.maxWindowLength) {
            throw "Window length too large";
        }
        var compressed = "";
        var pos = 0;
        var lastPos = data.length - this.minStringLength;
        while (pos < lastPos) {
            var searchStart = Math.max(pos - windowLength, 0);
            var matchLength = this.minStringLength;
            var foundMatch = false;
            var bestMatch = {
                distance:this.maxStringDistance,
                length:0
            };
            var newCompressed = null;
            while ((searchStart + matchLength) < pos) {
                var isValidMatch = ((data.substr(searchStart, matchLength) == data.substr(pos, matchLength)) && (matchLength < this.maxStringLength));
                if (isValidMatch) {
                    matchLength++;
                    foundMatch = true;
                } else {
                    var realMatchLength = matchLength - 1;
                    if (foundMatch && (realMatchLength > bestMatch.length)) {
                        bestMatch.distance = pos - searchStart - realMatchLength;
                        bestMatch.length = realMatchLength;
                    }
                    matchLength = this.minStringLength;
                    searchStart++;
                    foundMatch = false;
                }
            }
            if (bestMatch.length) {
                newCompressed = this.referencePrefix + this.encodeReferenceInt(bestMatch.distance, 2)
                + this.encodeReferenceLength(bestMatch.length);
                pos += bestMatch.length;
            } else {
                if (data.charAt(pos) != this.referencePrefix) {
                    newCompressed = data.charAt(pos);
                } else {
                    newCompressed = this.referencePrefix + this.referencePrefix;
                }
                pos++;
            }
            compressed += newCompressed;
        }
        return compressed + data.slice(pos).replace(/`/g, "``");
    },
	
    /**
	* Decompresses LZ77 compressed data.
	*
	* @param data
	*/
    decompress: function (data) {
        var decompressed = "";
        var pos = 0;
        while (pos < data.length) {
            var currentChar = data.charAt(pos);
            if (currentChar != this.referencePrefix) {
                decompressed += currentChar;
                pos++;
            } else {
                var nextChar = data.charAt(pos + 1);
                if (nextChar != this.referencePrefix) {
                    var distance = this.decodeReferenceInt(data.substr(pos + 1, 2), 2);
                    var length = this.decodeReferenceLength(data.charAt(pos + 3));
                    decompressed += decompressed.substr(decompressed.length - distance - length, length);
                    pos += this.minStringLength - 1;
                } else {
                    decompressed += this.referencePrefix;
                    pos += 2;
                }
            }
        }
        return decompressed;
    }
};

module.exports = new LZ77();