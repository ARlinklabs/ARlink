import { Worker } from 'worker_threads';
import path from 'path';
import os from 'os';
import fs from 'fs';

const MAX_CONCURRENT_BUILDS = os.cpus().length;
let runningBuilds = 0;
const buildQueue = [];

function createBuildWorker(buildParams) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.resolve('buildWorker.js'), {
      workerData: buildParams
    });

    worker.on('message', (message) => {
      console.log(`Build completed: ${message}`);
      resolve(message);
    });

    worker.on('error', reject);

    worker.on('exit', (code) => {
      runningBuilds--;
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
      processQueue();
    });
  });
}

function processQueue() {
  while (runningBuilds < MAX_CONCURRENT_BUILDS && buildQueue.length > 0) {
    const nextBuild = buildQueue.shift();
    runningBuilds++;
    nextBuild.start();
  }
}

export async function runBuild(buildParams) {
  return new Promise((resolve, reject) => {
    const build = {
      params: buildParams,
      start: () => {
        const projectRoot = process.cwd();
        const paramsWithRoot = { ...buildParams, projectRoot };
        createBuildWorker(paramsWithRoot)
          .then(result => {
            const { repository, outputDist, protocolLand, walletAddress, repoName } = buildParams;
            let owner, folderName;
            if (protocolLand) {
              owner = walletAddress;
              folderName = repoName;
            } else {
              owner = repository.split('/').reverse()[1];
              folderName = repository.replace(/\.git|\/$/, "").split("/").pop();
            }
            const buildPath = path.join(projectRoot, 'builds', owner, folderName, 'output');
            
            console.log("Checking build output at:", buildPath);
            if (fs.existsSync(buildPath)) {
              resolve({ result, buildPath });
            } else {
              reject(new Error(`Build output not found at ${buildPath}`));
            }
          })
          .catch(reject);
      }
    };

    buildQueue.push(build);
    processQueue();
  });
}