import { WebGLArcanumCube } from 'arcanumcube';
import './style.css';

import { World } from '@arcanumcube-demo';

async function onLoad() {
    const viewarea = document.getElementById('viewarea');
    if (!viewarea) {
        throw new Error('Demo markup is missing required elements.');
    }
    const messagebox = document.getElementById('messagebox');
    if (!messagebox) {
        throw new Error('Demo markup is missing required elements.');
    }
    const message = document.getElementById('message');
    if (!message) {
        throw new Error('Demo markup is missing required elements.');
    }
    const btn_scramble = document.getElementById('btn_scramble');
    if (!btn_scramble) {
        throw new Error('Demo markup is missing required elements.');
    }
    const btn_reset = document.getElementById('btn_reset');
    if (!btn_reset) {
        throw new Error('Demo markup is missing required elements.');
    }
    const btn_undo = document.getElementById('btn_undo');
    if (!btn_undo) {
        throw new Error('Demo markup is missing required elements.');
    }
    const btn_solve = document.getElementById('btn_solve');
    if (!btn_solve) {
        throw new Error('Demo markup is missing required elements.');
    }

    const world = new World({
        container: viewarea,
        cubeOptions: {
            twistOptions: {
                onTwisted: showCurrentTwisted,
            },
        },
    });

    function showCurrentTwisted(cube: WebGLArcanumCube) {
        const q = cube.getHistory();
        message!.innerHTML = `Twisted (${q.length}): ${q.join(' ')}`;
    }

    // controler
    messagebox.addEventListener('click', () => {
        messagebox.classList.toggle('hide');
    });
    btn_scramble.addEventListener('click', () => {
        const cube = world.getArcanumCube();
        cube?.scramble();
    });
    btn_reset.addEventListener('click', () => {
        const cube = world.getArcanumCube();
        cube?.reset();
        message.innerHTML = '';
    });
    btn_undo.addEventListener('click', () => {
        const cube = world.getArcanumCube();
        cube?.undo();
    });
    btn_solve.addEventListener('click', () => {
        const cube = world.getArcanumCube();
        let distanceMax = 0.1;
        let distanceMin = -1;
        if (cube) {
            const q = cube.getHistory();
            world.solve({
                onSolved: (answer) => {
                    if (answer.length > 0) {
                        message.innerHTML =
                            `Twisted (${q.length}): ${q.join(' ')}<br />` +
                            `Answer (${answer.length}): ${answer.join(' ')}`;
                        cube.easingTwist(answer, false, answer.length * 300, false, {
                            // suppress the display of each twist while showing the answer
                            onTwisted: () => {},
                        });
                    }
                },
                onProgress: (distance) => {
                    if (distance > distanceMax) distanceMax = distance;
                    if (distanceMin < 0 || distance < distanceMin) distanceMin = distance;
                    const progress = (1 - distanceMin / distanceMax) * 100;
                    message.innerHTML =
                        `Solving ... ${progress.toFixed(1)}%<br />` +
                        `<div class="progress" style="width: ${Math.round(progress)}%"></div>`;
                },
                onError: (error) => {
                    const msg = error.message || 'Failed to load solver or unknown error';
                    message.innerHTML = `<pre class="error">${msg}</pre>`;
                },
            });
        }
    });

    // draw cube
    world.draw();
}

window.addEventListener('load', onLoad);
