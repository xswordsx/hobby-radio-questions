const pdfreader = require('pdfreader');
const input = process.argv[2];

function remap_cyr(x) {
    switch (x) {
        // Cyrillic letters
        case 'А': return 'A';
        case 'Б': return 'B';
        case 'В': return 'C';
        case 'Г': return 'D';

        // Latin letters
        case 'A': return 'A';
        case 'B': return 'B';
    }
    return 'unknown (' + x + ')';
}

function printRows(rows) {
    return Object.keys(rows) // => array of y-positions (type: float)
        .sort((y1, y2) => parseFloat(y1) - parseFloat(y2)) // sort float positions
        .map(y => (rows[y] || []).join('')) // merge line
        .slice(0, -1) // drop last item -> page number
        .join('\n');
}

const readPdf = new Promise((resolve, reject) => {
    let rows = {};
    let data = [];

    new pdfreader.PdfReader().parseFileItems(
        input,
        function (err, item) {
            if (err) {
                reject(err);
                return;
            }
            if (!item) {
                // File read - push last data and exit.
                data.push(printRows(rows));
                resolve(data.join('\n'));
                return;
            }
            if (item.page) {
                data.push(printRows(rows));
                rows = {}; // clear rows for next page
            } else if (item.text) {
                // accumulate text items into rows object, per line
                (rows[item.y] = rows[item.y] || []).push(item.text);
            }
        }
    );
});

readPdf.then(inputLines => {
    inputLines = inputLines.split('\n');
    const output = [];
    let entry = {};
    
    const questionRegex = /^\d+\./;
    const answerRegex = /^ ?[АБВГ]?!([а-яА-Я])/;

    for (let i = 0; i < inputLines.length; i++) {
        const line = inputLines[i];

        if (questionRegex.test(line)) {
            // Next question reached - save the previous one.
            output.push(entry);

            // Extract question - can be multiline.
            //
            // Format is:
            //
            //   <Num>. Multi-line question? (<Corr. Answ>)
            //   A. Answ. 1
            //   Б. Answ. 2
            //   ...
            //
            let qLine = inputLines[i];
            while (!answerRegex.test(inputLines[i + 1])) {
                i++;
                qLine += ' ' + inputLines[i];
            }
            entry = {
                question: qLine.replace(/\s{2,}/g, ' ').trim()
            };
            entry.number = Number(entry.question.slice(0, entry.question.indexOf('.')));
            entry.correct = remap_cyr(entry.question[entry.question.length - 2]);
            entry.question = entry.question.slice(entry.question.indexOf(' ') + 1, -4);
            continue;
        }

        if (answerRegex.test(line)) {
            const letter = remap_cyr(line[0]);
            entry[letter] = line;
            while (inputLines[i + 1] && !(answerRegex.test(inputLines[i + 1]) || questionRegex.test(inputLines[i + 1]))) {
                i++;
                entry[letter] += ' ' + inputLines[i];
            }
            entry[letter] = entry[letter].slice(3, -1);
        }
    }

    const todoQuestion = output.find(x => {
        return !x.question.endsWith('?') || x.correct.contains('unknown');
    });

    if (todoQuestion.length > 0) {
        console.error('Questions need manual review:', todoQuestion.map(x => x.number).join(', '));
    }

    // First element is always empty - remove it.
    console.log(JSON.stringify(output.slice(1), null, 2));
})
.catch(ex => {
    console.error(ex);
    process.exit(1);
});
