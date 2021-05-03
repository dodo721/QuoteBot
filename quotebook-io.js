
const fs = require('fs');
const quotebook = require('./quotebook.json');

class QuotebookIO {
}

QuotebookIO.getQuotebook = () => quotebook;

QuotebookIO.newQuote = quote => {
	quotebook.push(quote);
	return new Promise ((resolve, reject) => {
		fs.writeFile('./quotebook.json', JSON.stringify(quotebook, null, 2), function (err) {
			if (err) reject(err);
			resolve(quotebook);
		});
	});
};

module.exports = QuotebookIO;
