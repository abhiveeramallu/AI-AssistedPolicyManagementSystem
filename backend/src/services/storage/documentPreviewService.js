const { spawn } = require('child_process');

const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const convertDocxBufferToHtml = (docxBuffer) =>
  new Promise((resolve, reject) => {
    const converter = spawn('/usr/bin/textutil', ['-convert', 'html', '-stdin', '-stdout']);

    const stdoutChunks = [];
    const stderrChunks = [];

    converter.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
    converter.stderr.on('data', (chunk) => stderrChunks.push(chunk));

    converter.on('error', (error) => {
      reject(new Error(`DOCX preview converter unavailable: ${error.message}`));
    });

    converter.on('close', (code) => {
      if (code !== 0) {
        const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();
        reject(new Error(stderr || `DOCX preview conversion failed with exit code ${code}`));
        return;
      }

      const html = Buffer.concat(stdoutChunks).toString('utf8');
      resolve(html);
    });

    converter.stdin.end(docxBuffer);
  });

module.exports = {
  DOCX_MIME_TYPE,
  convertDocxBufferToHtml
};
