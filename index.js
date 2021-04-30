const Discord = require("discord.js");
const config = require("./config.json");
const fs = require('fs');
const Canvas = require('canvas');
const sizeOf = require('image-size');

let quotebook = [];
let quotebookStr = "";
const backgrounds = [];

console.log("Loading...");

const loadQuotebook = () => {
	quotebook = [];
	fs.readFile('./Quotebook.txt', 'utf8' , (err, data) => {
		if (err) {
			console.error(err);
			return;
		}
		quotebookStr = data;
		data.split("\n").forEach(quote => {
			const quoteRegex = /"(.*)" ?- ?(.*) (.*)/g;
			const match = quoteRegex.exec(quote);
			if (!match) {
				console.error("Could not parse quote: ", quote);
				return;
			}
			const text = match[1];
			const author = match[2];
			const date = match[3];
			quotebook.push({quote:text, author, date});
		});
		console.log("Loaded " + quotebook.length + " quotes, lets quote babey");
	});
};

const newQuote = quote => {
	const newQuoteStr = '"' + quote.quote + '" - ' + quote.author + ' ' + quote.date;
	return new Promise ((resolve, reject) => {
		fs.writeFile('Quotebook.txt', quotebookStr + "\n" + newQuoteStr, function (err) {
			if (err) reject(err);
			loadQuotebook();
			resolve();
		});
	});
};

fs.readdir("./backgrounds/", (err, files) => {
	if (err) {
		console.error(err);
		return;
	}
	files.forEach(file => {
		backgrounds.push(file);
	});
	console.log("Loaded " + backgrounds.length + " backgrounds");
});

loadQuotebook();

const authorDateMatch = (author, date, quote) => {
	const author1 = quote.author.toLowerCase();
	const author2 = author && author.toLowerCase();
	let authorMatch = !author || author1 === author2 || author1.includes(author2) || author2.includes(author1);
	let dateMatch = !date || date === quote.date;
	return authorMatch && dateMatch;
}

const quoteToStr = quote => {
	return '"' + quote.quote + '" - ' + quote.author + ', ' + quote.date;
};

const chooseQuote = (author, date) => {
	let selection = [];
	quotebook.forEach(quote => {
		if (authorDateMatch(author, date, quote)) selection.push(quote);
	});
	if (!selection.length) return null;
	const selQuote = selection[Math.floor(Math.random() * selection.length)];
	return selQuote;
};

const searchForQuote = (author, date, content) => {
	let results = [];
	quotebook.forEach(quote => {
		if (authorDateMatch(author, date, quote)) {
			const text1 = content.toLowerCase();
			const text2 = quote.quote.toLowerCase();
			const resQuote = Object.assign({}, quote);
			if (text1.includes(text2) || text2.includes(text1)) {
				resQuote.priority = Infinity;
				results.push(resQuote);
				return;
			}
			const words = text1.split(" ");
			let wordCount = 0;
			words.forEach(word => {
				if (text2.includes(word)) {
					wordCount++;
				}
			});
			if (wordCount) {
				resQuote.priority = wordCount;
				results.push(resQuote);
			}
		}
	});
	const compare = ( a, b ) => {
		if ( a.priority > b.priority ){
		  return -1;
		}
		if ( a.priority < b.priority ){
		  return 1;
		}
		return 0;
	}
	results.sort(compare);
	return results;
};

// Pass the entire Canvas object because you'll need to access its width, as well its context
const autoFont = (canvas, text, pos, startSize) => {
	const ctx = canvas.getContext('2d');

	// Declare a base size of the font
	let fontSize = startSize;
	let width = 0;

	do {
		// Assign the font to the context and decrement it so it can be measured again
		ctx.font = `${fontSize -= 5}px Courier New`;
		width = ctx.measureText(text).width 
		// Compare pixel width of the text to the canvas minus the approximate avatar size
	} while (width + pos.x > canvas.width - 100);

	// Return the result to use in the actual canvas
	return {font: ctx.font, width, size: fontSize};
};

const drawText = (canvas, ctx, text, pos, size) => {
	const autoFontSize = autoFont(canvas, text, pos, size);

	ctx.fillStyle = "rgba(0,0,0,0.5)";
	ctx.fillRect(pos.x - 20, pos.y - (autoFontSize.size / 2) - 30, autoFontSize.width + 20, autoFontSize.size + 30);

	ctx.font = autoFontSize.font;
	// Select the style that will be used to fill the text in
	ctx.globalCompositeOperation = "difference";
	ctx.fillStyle = "white";
	// Actually fill the text with a solid color
	ctx.fillText(text, pos.x, pos.y);
	
	// Overlay with transparent white text to bring out more
	ctx.globalCompositeOperation = "source-over";
	ctx.fillStyle = "rgba(255,255,255,0.3)";
	// Actually fill the text with a solid color
	ctx.fillText(text, pos.x, pos.y);
}

const putQuoteOnImage = async (imgPath, quote) => {
	const dimensions = sizeOf(imgPath);
	const canvas = Canvas.createCanvas(dimensions.width, dimensions.height);
	const ctx = canvas.getContext('2d');

	const pos = {x: canvas.width / 6, y: canvas.height / 2.2};

	const img = await Canvas.loadImage(imgPath);
	
	ctx.drawImage(img, 0, 0, dimensions.width, dimensions.height);

	drawText(canvas, ctx, '"' + quote.quote + '"', pos, 70);
	drawText(canvas, ctx, "- " + quote.author + ", " + quote.date, {x: pos.x + 150, y: pos.y + 200}, 50);

	return canvas.toBuffer();
}

const chooseBackground = () => {
	return "./backgrounds/" + backgrounds[Math.floor(Math.random() * backgrounds.length)];
};

const client = new Discord.Client();

client.on("message", async function(message) {
	if (message.author.bot) return;

	const content = message.content;
	const channel = message.channel;
	if (!content.startsWith("!q")) return;

	if (!content.startsWith("!q")) return;
	const args = content.split(" ");

	console.log("HI!");

	if (args[1] === "-s") {
		if (args.length < 3) {
			message.reply("Search usage: !quote -s <author> [date | content] [...content]")
			return;
		}
		const author = args[2];
		const date = Number.isInteger(args[3]) && args[3];
		let content = "";
		for (let i = date ? 4 : 3; i < args.length; i++) {
			content += args[i] + (i === args.length - 1 ? "" : " ");
		}
		const quoteSearch = searchForQuote(author, date, content);
		let msg = "Our scribes have searched the library and suggested these scrolls:\n```\n";
		quoteSearch.forEach(quote => {
			msg += quoteToStr(quote) + "\n";
		});
		msg += "\n```";
		message.reply(msg);
		return;
	} else if (args[1] === "-a") {
		if (args.length < 4) {
			message.reply("Add usage: !quote -a <author> <date> <...content>")
			return;
		}
		const author = args[2];
		const date = args[3];
		const content = args.splice(4, args.length).join(" ");
		const quote = {quote:content, author, date};
		await newQuote(quote);
		message.reply("Added new quote " + quoteToStr(quote));
		return;
	}

	const person = args.length > 1 && args[1];
	const date = args.length > 2 && args[2];
	const quote = chooseQuote(person, date);
	if (quote) {
		const img = await putQuoteOnImage(chooseBackground(), quote);
		if (img) {
			const attachment = new Discord.MessageAttachment(img, 'welcome-image.png');
			channel.send(null, attachment);
		} else {
			channel.send(quoteToStr(quote));
		}
	} else {
		channel.send ("The scriptures contain no record of to satisfy this request.");
	}
});

client.login(config.BOT_TOKEN);
