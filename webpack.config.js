const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');
const JavaScriptObfuscator = require('webpack-obfuscator');
//const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = (env) => {

  const isProd = env.production || false;
  const mode = isProd ? 'production' : 'development';

  const webpackConfig = {
    mode,
    target: 'web',
    entry: './src/main.ts',
    output: {
      filename: 'main.js',
      path: path.resolve(__dirname, 'dist'),
    },
    module: {
      rules: [
        {
          test: /\.(glsl|vert|frag|comp|rgen|rint|rchit|rahit|rmiss)$/,
          exclude: /node_modules/,
          use: [
            path.resolve(__dirname, './webrtx/src/webpack-glsl-loader.js'),
          ]
        },
        {
          test: /\.ts$/,
          use: [
            {
              loader: 'ts-loader',
              options: {
                logLevel: 'debug',
                compilerOptions: {
                  //"traceResolution": true,
                }
              }
            }
          ],
          exclude: /node_modules/,
        }, 
      ],
    },
    experiments: {
      asyncWebAssembly: true,
    },
    resolve: {
      extensions: ['.ts', '.js'],
    },
    devtool: !isProd && 'inline-source-map',
    optimization: {
      minimize: isProd,
      minimizer: [
        isProd ? new TerserPlugin({
          terserOptions: {
            compress: { drop_console: true }, // 콘솔 로그 제거
          },
        }) : undefined,
      ].filter(Boolean)
    },
    plugins: [
      isProd ? new JavaScriptObfuscator({
        compact: true,
        controlFlowFlattening: true,  // 더 강력한 난독화 옵션
        controlFlowFlatteningThreshold: 0.3, // 제어 흐름 평탄화 확률
        deadCodeInjection: false, // 사용되지 않는 코드 주입
        deadCodeInjectionThreshold: 0.4,  // 주입 확률 40%
        debugProtection: false, // 디버깅 방어 기능(true시 성능 저하)
      }) : undefined
    ].filter(Boolean)
  };

  console.log('Webpack configuration:', webpackConfig);
  return webpackConfig;
};
