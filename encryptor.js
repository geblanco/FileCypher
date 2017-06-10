'use strict'

const options = { algorithm: 'aes256' }
const { encryptFile, decryptFile } = require('file-encryptor')

function processFile (processCb, inputFile, outputFile, password, options, callback) {
  processCb(inputFile, outputFile, password, options, (err) => {
    if (err) {
      callback(err)
    } else {
      callback(null)
    }
  })
}

module.exports = {
  encryptFile: (inputPath, outputPath, password, callback) => {
    processFile(encryptFile, inputPath, outputPath, password, options, callback)
  },
  decryptFile: (inputPath, outputPath, password, callback) => {
    processFile(decryptFile, inputPath, outputPath, password, options, callback)
  }
}
