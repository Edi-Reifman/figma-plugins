Pure-JavaScript Brotli decoder from brotli-compress 2.2.2.
Only js.cjs is used; the package's separate WASM compressor is not bundled.
The decoder is unmodified and is wrapped in a private CommonJS scope by build.cjs.

Exact upstream source:
https://github.com/kyr0/brotli-compress/tree/7e633f31b83e7d522fc2ff7c21905d30e82eab71
Source archive:
https://github.com/kyr0/brotli-compress/archive/7e633f31b83e7d522fc2ff7c21905d30e82eab71.zip

The handwritten JavaScript decoder is derived from Google's implementation,
Copyright 2017 Google Inc., under MIT; see LICENSE-MIT and the notice in js.cjs.
The package also includes Apache-2.0 licensing for integration code;
see LICENSE-APACHE. All notices are retained.

PrintPrep uses it to unpack a trusted, locally bundled, losslessly compressed
Ghostscript WASM asset inside the export Worker. No network fetch is performed.
The restored WASM must match its expected length and, when Web Crypto is
available, its SHA-256 digest before instantiation. The build and tests also
verify byte-for-byte restoration independently.
