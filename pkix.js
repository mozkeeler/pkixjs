var Results = {
  Success: 0,
  InvalidArguments: 1,
  InsufficientLength: 2,
  UnexpectedTag: 3,
  HighTagNumber: 4,
  BadDER: 5,
  TooMuchData: 6,
  ExtraneousData: 7,
  InvalidBooleanEncoding: 8,
};

// Takes an ArrayBuffer
function Input() {
}

Input.prototype = {
  data: null,
  length: 0,

  init: function(data, length) {
    this.data = new Uint8Array(data);
    this.length = length;
  },

  unsafeGetData: function() {
    return this.data;
  },

  getLength: function() {
    return this.length;
  }
};

function Reader(input) {
  this.input = input.unsafeGetData();
  this.cursor = 0;
  this.length = input.getLength();
}

Reader.prototype = {
  input: null,
  cursor: 0,
  length: 0,

  peek: function(expectedByte) {
    if (this.ensureLength(1) != Results.Success) {
      return false;
    }
    return this.input[cursor] == expectedByte;
  },

  ensureLength: function(requestedLength) {
    if (requestedLength < 0) {
      return Results.InvalidArguments;
    }
    if (this.cursor + requestedLength > this.length) {
      return Results.InsufficientLength;
    }
    return Results.Success;
  },

  readByte: function(out) {
    var rv = this.ensureLength(1);
    if (rv != Results.Success) {
      return rv;
    }
    out.value = this.input[this.cursor];
    this.cursor++;
    return Results.Success;
  },

  skip: function(length, skippedInput) {
    var rv = this.ensureLength(length);
    if (rv != Results.Success) {
      return rv;
    }
    var skipped = this.input.slice(this.cursor, this.cursor + length);
    this.cursor += length;
    skippedInput.init(skipped, length);
    return Results.Success;
  },

  atEnd: function() {
    return this.cursor == this.length;
  },
};

var Classes = {
  UNIVERSAL: 0 << 6,
  CONTEXT_SPECIFIC: 2 << 6,
};

var Tags = {
  BOOLEAN:  Classes.UNIVERSAL | 0x01,
};

var DER = {
  expectTagAndGetValueAtEnd: function(reader, tag, value) {
    var rv = DER.expectTagAndGetValue(reader, tag, value);
    if (rv != Results.Success) {
      return rv;
    }
    return DER.end(reader);
  },

  expectTagAndGetValue: function(reader, tag, value) {
    var actualTag = {};
    var rv = DER.readTagAndGetValue(reader, actualTag, value);
    if (rv != Results.Success) {
      return rv;
    }
    if (actualTag.value != tag) {
      return Results.UnexpectedTag;
    }
    return Results.Success;
  },

  readTagAndGetValue: function(reader, tag, value) {
    var rv = reader.readByte(tag);
    if (rv != Results.Success) {
      return rv;
    }
    if ((tag.value & 0x01F) == 0x01F) {
      return Results.HighTagNumber;
    }
    var length;
    var length1 = {};
    rv = reader.readByte(length1);
    if (rv != Results.Success) {
      return rv;
    }
    if (!(length1.value & 0x80)) {
      length = length1.value;
    } else if (length1.value == 0x81) {
      var length2 = {};
      rv = reader.readByte(length2);
      if (rv != Results.Success) {
        return rv;
      }
      if (length2.value < 128) {
        return Results.BadDER;
      }
      length = length2.value;
    } else if (length1.value == 0x82) {
      var twoByteLength = {};
      rv = reader.readTwoBytes(twoByteLength);
      if (rv != Results.Success) {
        return rv;
      }
      if (twoByteLength.value < 256) {
        return Results.BadDER;
      }
      length = twoByteLength.value;
    } else {
      return Results.TooMuchData;
    }

    return reader.skip(length, value);
  },

  end: function(reader) {
    if (!reader.atEnd()) {
      return Results.ExtraneousData;
    }
    return Results.Success;
  },

  boolean: function(reader, value) {
    var booleanInput = new Input();
    var rv = DER.expectTagAndGetValue(reader, Tags.BOOLEAN, booleanInput);
    if (rv != Results.Success) {
      return rv;
    }
    var booleanReader = new Reader(booleanInput);
    var intValue = {};
    rv = booleanReader.readByte(intValue);
    if (rv != Results.Success) {
      return rv;
    }
    rv = DER.end(booleanReader);
    if (rv != Results.Success) {
      return rv;
    }
    switch (intValue.value) {
      case 0:
        value.value = false;
        return Results.Success;
      case 0xFF:
        value.value = true;
        return Results.Success;
      default:
        return Results.InvalidBooleanEncoding;
    }
  }
};

function testBOOLEAN(testArray, expectedResult, expectedValue) {
  var der = new Uint8Array(testArray);
  var input = new Input();
  input.init(der, testArray.length);
  var reader = new Reader(input);
  var boolean = {};
  var rv = DER.boolean(reader, boolean);
  if (rv != expectedResult) {
    throw "expected Result " + expectedResult + " got " + rv;
  }
  if (expectedResult == Results.Success) {
    if (boolean.value != expectedValue) {
      throw "expected value " + expectedValue + " got " + boolean.value;
    }
  }
}

testBOOLEAN([0x01, 0x01, 0x00], Results.Success, false);
testBOOLEAN([0x01, 0x01, 0xFF], Results.Success, true);
testBOOLEAN([0x01, 0x01, 0x42], Results.InvalidBooleanEncoding, null);
testBOOLEAN([0x01, 0x02, 0x42, 0x42], Results.ExtraneousData, null);
