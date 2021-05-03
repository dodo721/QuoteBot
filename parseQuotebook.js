
const fs = require('fs');
const QuotebookIO = require('./quotebook-io.js');

QuotebookIO.loadQuotebook().then(quotebook => {
	const jsonStr = JSON.stringify(quotebook, null, 2);
	fs.writeFile('./quotebook.json', jsonStr, err => {
		if (err) console.error(err);
		else console.log("Parsed!");
	});
});
