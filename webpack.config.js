const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');

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
  };

  console.log('Webpack configuration:', webpackConfig);
  return webpackConfig;
};
