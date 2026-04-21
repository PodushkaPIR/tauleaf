const esbuild = require('esbuild');
const path = require('path');

async function build() {
  await esbuild.build({
    entryPoints: [path.join(__dirname, 'src/editor.js')],
    bundle: true,
    minify: true,
    outfile: path.join(__dirname, 'web/js/editor.bundle.js'),
    format: 'iife',
    globalName: 'CodeMirror6',
    define: {
      'process.env.NODE_ENV': '"production"'
    }
  });
  console.log('Built editor.bundle.js');
}

build().catch(console.error);
