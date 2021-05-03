const Discord = require("discord.js");
const fs = require('fs');
const config = require("./config.json");
const Canvas = require('canvas');
const sizeOf = require('image-size');
const QuotebookIO = require('./quotebook-io.js');

let quotebook = QuotebookIO.getQuotebook();
const backgrounds = [];

console.log("Loading...");

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

const captureGlyphs = {
	"'" : "'",
	'"' : '"',
	"(" : ")"
};

const removeEscapes = str => {
	let res = str;
	Object.keys(captureGlyphs).forEach(glyph => {
		res = res.replace("\\" + glyph, glyph);
		res = res.replace("\\" + captureGlyphs[glyph], captureGlyphs[glyph]);
	});
	return res;
};

const parseArgs = cmd => {
	let res = [];
	let terminator = null;
	const parts = cmd.split(" ");
	parts.forEach(part => {
		if (!part) return;
		if (terminator) {
			if (part.endsWith(terminator) && !part.endsWith("\\" + terminator)) {
				const toAdd = part.substring(0, part.length - terminator.length);
				terminator = null;
				res[res.length - 1] += " " + removeEscapes(toAdd);
				return;
			}
			res[res.length - 1] += " " + removeEscapes(part);
			return;
		}
		Object.keys(captureGlyphs).forEach(initiator => {
			if (part.startsWith(initiator) && !part.startsWith("\\" + initiator)) {
				terminator = captureGlyphs[initiator];
				res.push(removeEscapes(part.replace(initiator, "")));
			}
		});
		if (terminator) return;
		res.push(removeEscapes(part));
	});
	return res;
};

const authorDateMatch = (author, date, quote) => {
	const author1 = quote.author.toLowerCase().replace(" ", "");
	const author2 = author && author.toLowerCase().replace (" ", "");
	const date1 = quote.date.toLowerCase().replace(" ", "");
	const date2 = date && date.toLowerCase().replace(" ", "");
	let authorMatch = !author || author1 === author2 || author1.includes(author2) || author2.includes(author1);
	let dateMatch = !date || date1 === date2 || date1.includes(date2) || date2.includes(date1);
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

const autoSizeFont = ({canvas, ctx, text, pos, startSize, minimumSize}) => {
	// Declare a base size of the font
	let fontSize = startSize;
	let width = 0;
	let fitTextIn = false;
	do {
		// Assign the font to the context and decrement it so it can be measured again
		ctx.font = `${fontSize -= 5}px Courier New`;
		width = ctx.measureText(text).width;
		fitTextIn = !(width + pos.x > canvas.width - 100);
		// Compare pixel width of the text to the canvas minus the approximate avatar size
	} while (!fitTextIn && fontSize >= minimumSize);
	return {fontSize, width, fitTextIn, font:ctx.font};
}

// Pass the entire Canvas object because you'll need to access its width, as well its context
const autoFont = ({canvas, text, pos, startSize, minimumSize}) => {
	const ctx = canvas.getContext('2d');

	let newText = text;

	// Declare a base size of the font
	let fitTextIn = false;
	let parts = text.split(" ");
	let sizing;
	let wordbreakPos = parts.length - 1;

	do {
		sizing = autoSizeFont({canvas, ctx, text:newText, pos, startSize, minimumSize});
		fitTextIn = sizing.fitTextIn;
		if (!fitTextIn) {
			if (wordbreakPos < parts.length / 2) break;
			let newParts = parts.slice();
			newParts.splice(wordbreakPos, 0, "\n");
			newText = newParts.join(" ");
			wordbreakPos--;
		}
	} while (!fitTextIn);

	// Return the result to use in the actual canvas
	return {font:sizing.font, width:sizing.width, size:sizing.fontSize, text:newText};
};

const drawText = ({canvas, ctx, text, pos, size, minimumSize}) => {
	const autoFontSize = autoFont({canvas, text, pos, startSize:size, minimumSize});

	noOfLines = autoFontSize.text.split("\n").length;
	ctx.fillStyle = "rgba(0,0,0,0.5)";
	ctx.fillRect(pos.x - 20, pos.y - (autoFontSize.size / 2) - 30, autoFontSize.width + 20, (autoFontSize.size * noOfLines) + 30);

	ctx.font = autoFontSize.font;
	// Select the style that will be used to fill the text in
	ctx.globalCompositeOperation = "difference";
	ctx.fillStyle = "white";
	// Actually fill the text with a solid color
	ctx.fillText(autoFontSize.text, pos.x, pos.y);
	
	// Overlay with transparent white text to bring out more
	ctx.globalCompositeOperation = "source-over";
	ctx.fillStyle = "rgba(255,255,255,0.3)";
	// Actually fill the text with a solid color
	ctx.fillText(autoFontSize.text, pos.x, pos.y);
}

const putQuoteOnImage = async (imgPath, quote) => {
	const dimensions = sizeOf(imgPath);
	const canvas = Canvas.createCanvas(dimensions.width, dimensions.height);
	const ctx = canvas.getContext('2d');

	const pos = {x: canvas.width / 6, y: canvas.height / 2.2};

	const img = await Canvas.loadImage(imgPath);
	
	ctx.drawImage(img, 0, 0, dimensions.width, dimensions.height);

	drawText({canvas, ctx, text:'"' + quote.quote + '"', pos, size:70, minimumSize:30});
	drawText({canvas, ctx, text:"- " + quote.author + ", " + quote.date, pos:{x: pos.x + 150, y: pos.y + 200}, size:50, minimumSize:30});

	return canvas.toBuffer();
}

const chooseBackground = () => {
	return "./backgrounds/" + backgrounds[Math.floor(Math.random() * backgrounds.length)];
};

let pendingConfirmations = {};

const client = new Discord.Client();

client.on("message", async function(message) {
	if (message.author.bot) return;

	const content = message.content;
	const channel = message.channel;

	if (!content.startsWith("!q")) return;
	/*if (content.includes("\n")) {
		channel.send("Multiple lines are not yet supported by QuoteBot.");
		return;
	}*/
	const args = parseArgs(content);

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
		pendingConfirmations[message.author.id] = quote;
		channel.send("This will add the following quote:\n```\"" + quote.quote + "\"\nAuthor: " + quote.author + "\nDate: " + quote.date + "```\nUse !q -y to confirm, or !q -n to cancel.");
		return;
	} else if (args[1] === "-y" || args[1] === "-n") {
		if (!pendingConfirmations[message.author.id]) {
			message.reply("you have no pending quotes to confirm.");
		} else if (args[1] === "-n") {
			message.reply("your pending quote has been deleted.");
			delete pendingConfirmations[message.author.id];
		} else {
			const quote = pendingConfirmations[message.author.id];
			delete pendingConfirmations[message.author.id];
			console.log("Added new quote:", quote);
	                await QuotebookIO.newQuote(quote);
	                quotebook = QuotebookIO.getQuotebook();
	                message.reply("Added new quote " + quoteToStr(quote));
		}
		return;
	} else if (args[1] === "-h") {
		const help = `
"QuoteBots are a dumb idea" - person stabbed, 2021

COMMANDS:
\`\`\`
<> = mandatory, [] = optional, ... = any number of arguments

!q [author] [date] - generate a random quote from author and date (if given).
!q -s <author> [date | content] [...content] - search for a quote by author, date and content. NOTE: only searches by date if the 2nd argument is recognised as a number.
!q -a <author> <date> <...content> - add a new quote to the quotebook.
!q -h - show this message.
\`\`\`

SYNTAX:
\`\`\`
When writing a new quote or searching for one, sometimes you want to use an author or date that contains spaces.
All commands are parsed for brackets (), quotes "" and single quotes ''. Using these will group all text contained between into one argument.
If you want to include those characters normally, you can escape them with a backslash: \\( \\)
\`\`\`
		`;
		channel.send(help);
		return;
	}

	const person = args.length > 1 && args[1];
	const date = args.length > 2 && args[2];
	const quote = chooseQuote(person, date);
	if (quote) {
		const img = await putQuoteOnImage(chooseBackground(), quote);
		if (img) {
			const attachment = new Discord.MessageAttachment(img, 'quote.png');
			channel.send(null, attachment);
		} else {
			channel.send(quoteToStr(quote));
		}
	} else {
		channel.send ("The scriptures contain no record of to satisfy this request.");
	}
});

client.login(config.BOT_TOKEN);

