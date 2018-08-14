import json from 'rollup-plugin-json';
import commonjs from 'rollup-plugin-commonjs';
import resolve from 'rollup-plugin-node-resolve';
import babel from 'rollup-plugin-babel';
import images from 'rollup-plugin-image';
//import eslint from 'rollup-plugin-eslint';

import { main, module } from './package.json';
const env = process.env.NODE_ENV;

export default {
  input: 'src/lsr-img.js',
  output: {
    name: 'LSRImg',
    file: {
      esm: module,
      umd: main,
    }[env],
    format: env,
    sourcemap: true,
    globals: {
      jszip: 'JSZip'
    }
  },
  plugins: [
    json(),
    resolve({
      jsnext: true,
      main: true
    }),
    commonjs(),
    babel({
      exclude: 'node_modules/**',
      externalHelpers: true
    }),
    images(),
    //eslint()
  ],
  external: ['jszip']
};