const path = require('path')

module.exports = {
  entry: './browser/index.tsx',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: 'ts-loader',
        exclude: /node_modules/,
        options: {
          context: path.join(__dirname, 'browser'),
          configFile: path.join(__dirname, 'browser', 'tsconfig.json')
        }
      }
    ]
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js']
  },
  output: {
    filename: 'index.js',
    path: path.resolve(__dirname, 'pages/js')
  }
}
