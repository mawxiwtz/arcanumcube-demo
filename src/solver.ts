import * as ARCCUBE from 'arcanumcube';
import * as tf from '@tensorflow/tfjs';
import HeapQueue from './heapqueue.js';

export type SolverMessage = {
    distance: number; // -1: solved, else: distance to minimum goal skips that predicted
    answer?: ARCCUBE.Twist[]; // twist array of answer
};

export type SolverArgs = {
    stickers: ARCCUBE.StickerColor[];
};

self.onmessage = function (event) {
    const data = <SolverArgs>event.data;

    solve(data.stickers, 100, 150, 0.3).then((answer) => {
        // send answer to main thread
        self.postMessage({ distance: -1, answer });
    });
};

async function solve(
    stickers: ARCCUBE.StickerColor[],
    batchSize: number,
    n: number,
    l: number,
): Promise<ARCCUBE.Twist[]> {
    tf.engine().startScope();
    //console.log(tf.memory());

    function* getNextStateAndAnswers(): Generator<
        [number, ARCCUBE.StickerColor[], ARCCUBE.Twist[]]
    > {
        const range = Math.min(n, queue.length());
        for (let i = 0; i < range; i++) {
            const v = queue.heappop();
            if (!v) continue;

            for (const action of ARCCUBE.SINGLE_TWIST_LIST) {
                const next_state = ARCCUBE.getNextStickerColors(v.state, action);
                const next_answer = [...v.answer]; // clone
                next_answer.push(action); // clone + push
                const next_state_id = next_state.join('');
                if (
                    !(next_state_id in visitedStates) ||
                    visitedStates[next_state_id] > next_answer.length
                ) {
                    visitedStates[next_state_id] = next_answer.length;
                    yield [v.distance, next_state, next_answer];
                }
            }
        }
    }

    if (ARCCUBE.MatchGoalState(stickers)) {
        console.log('Already solved.');
        return [];
    }

    // Worker内は別スコープのため、ファイルパス指定はURIベースに注意する必要がある。
    const modelUrl = new URL('/assets/model/twist_cost/model.json', import.meta.url);
    //const model = await tf.loadGraphModel(modelUrl.toString());
    const model = await tf.loadLayersModel(modelUrl.toString());
    //console.log(model.summary());

    // search queue
    const queue = new HeapQueue<{
        distance: number;
        state: ARCCUBE.StickerColor[];
        answer: ARCCUBE.Twist[];
    }>();
    queue.heappush(0, { distance: 0, state: stickers, answer: [] });
    const visitedStates = { [stickers.join('')]: 0 };

    while (queue.length() > 0) {
        const next_states: ARCCUBE.StickerColor[][] = [];
        const next_answers: ARCCUBE.Twist[][] = [];
        const x: number[][][][] = [];

        for (const next of getNextStateAndAnswers()) {
            const [distance, next_state, next_answer] = next;

            // send progress to main thread
            if (distance > 0) self.postMessage({ distance });

            next_states.push(next_state);
            next_answers.push(next_answer);
            if (ARCCUBE.MatchGoalState(next_state)) {
                model.dispose();
                tf.engine().endScope();
                return next_answer;
            }
            const a = ARCCUBE.getArrayForTensor(next_state);
            x.push(a);
        }

        const cost_to_goals = tf.tidy(() => {
            const tx = tf.tensor(x);
            const y = model.predict(tx, { batchSize }) as tf.Tensor;
            const c = y.dataSync();
            return c;
        });
        //console.log(cost_to_goals);
        //console.log(tf.memory());

        next_answers.forEach((next_answer, i) => {
            const distance = cost_to_goals[i];
            queue.heappush(l * next_answer.length + distance, {
                distance,
                state: next_states[i],
                answer: next_answers[i],
            });
        });
    }

    // Answer not found
    tf.engine().endScope();
    console.log('Could not found any answers, give up.');
    return [];
}
