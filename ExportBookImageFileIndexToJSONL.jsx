/*
  ExportBookImageFileIndexToJSONL.jsx

  Select an InDesign Book (.indb), count unique linked image files,
  and write one JSONL/NDJSON record per image file with all page occurrences.
*/

function main() {
    alert(
        "脚本已启动。\n\n" +
            "下一步请选择一个 .indb 书籍文件。\n" +
            "脚本会统计书中有多少个唯一图片文件，并列出每个图片出现在哪些页面。"
    );

    var bookFile = chooseBookFile();
    if (!bookFile) {
        alert("已取消：没有选择 .indb 书籍文件。");
        return;
    }

    var scriptFolder = getScriptFolder();
    var outputFiles = buildOutputFiles(scriptFolder, bookFile);

    var oldUserInteraction = app.scriptPreferences.userInteractionLevel;
    var oldRedraw = app.scriptPreferences.enableRedraw;
    var book = null;
    var openedBookHere = false;
    var completionMessage = "";

    try {
        app.scriptPreferences.userInteractionLevel =
            UserInteractionLevels.NEVER_INTERACT;
        app.scriptPreferences.enableRedraw = false;

        var existingBook = findOpenBookByPath(bookFile);
        if (existingBook) {
            book = existingBook;
        } else {
            book = app.open(bookFile);
            openedBookHere = true;
        }

        var result = scanBook(book, bookFile);
        writeImageIndexJSONL(outputFiles.index, result);
        writeTextFile(
            outputFiles.summary,
            stringifyJSON(buildSummaryOutput(result, outputFiles))
        );

        completionMessage =
            "完成！\n\n" +
            "书籍: " +
            result.bookName +
            "\n文档数: " +
            result.summary.documentCount +
            "\n页面数: " +
            result.summary.pageCount +
            "\n图片放置次数: " +
            result.summary.graphicPlacementCount +
            "\n唯一图片文件数: " +
            result.summary.uniqueLinkedImageFileCount;

        if (result.summary.embeddedGraphicCount > 0) {
            completionMessage +=
                "\n嵌入图像数: " + result.summary.embeddedGraphicCount;
        }
        if (result.summary.errorCount > 0) {
            completionMessage += "\n错误数: " + result.summary.errorCount;
        }

        completionMessage +=
            "\n\n图片索引 JSONL/NDJSON 已保存到:\n" +
            outputFiles.index.fsName +
            "\n\n摘要 JSON 已保存到:\n" +
            outputFiles.summary.fsName;
    } finally {
        if (openedBookHere && book) {
            try {
                book.close(SaveOptions.NO);
            } catch (closeBookError) {}
        }
        app.scriptPreferences.userInteractionLevel = oldUserInteraction;
        app.scriptPreferences.enableRedraw = oldRedraw;
    }

    if (completionMessage) {
        alert(completionMessage);
    }
}

function chooseBookFile() {
    return File.openDialog("请选择 InDesign 书籍文件 (.indb)", "*.indb", false);
}

function scanBook(book, bookFile) {
    var result = {
        schemaVersion: 1,
        generatedAt: formatDate(new Date()),
        bookName: valueOrBlank(safeRead(book, "name")) || bookFile.name,
        bookPath: bookFile.fsName,
        summary: {
            documentCount: 0,
            pageCount: 0,
            graphicPlacementCount: 0,
            uniqueLinkedImageFileCount: 0,
            embeddedGraphicCount: 0,
            errorCount: 0
        },
        documents: [],
        imageOrder: [],
        imageMap: {},
        embeddedGraphics: []
    };

    var contents = safeRead(book, "bookContents");
    var contentCount = collectionLength(contents);
    var bookPageNumber = 1;

    for (var i = 0; i < contentCount; i++) {
        var bookContent = null;
        try {
            bookContent = contents[i];
        } catch (contentError) {
            result.summary.errorCount++;
            result.documents.push({
                bookDocumentIndex: i + 1,
                error: "无法读取 bookContents[" + i + "]: " + contentError
            });
            continue;
        }

        var docSummary = scanBookContent(
            result,
            bookContent,
            i + 1,
            bookPageNumber
        );
        bookPageNumber = docSummary.nextBookPageNumber;
        docSummary.nextBookPageNumber = undefined;
        result.documents.push(docSummary);
        result.summary.documentCount++;
    }

    result.summary.uniqueLinkedImageFileCount = result.imageOrder.length;
    return result;
}

function scanBookContent(result, bookContent, bookDocumentIndex, startBookPageNumber) {
    var docFile = getBookContentFile(bookContent);
    var docSummary = {
        bookDocumentIndex: bookDocumentIndex,
        bookContentName: valueOrBlank(safeRead(bookContent, "name")),
        documentName: "",
        documentPath: docFile ? docFile.fsName : "",
        bookPageRange: valueOrBlank(safeRead(bookContent, "documentPageRange")),
        pageCount: 0,
        graphicPlacementCount: 0,
        uniqueLinkedImageFileCount: 0,
        embeddedGraphicCount: 0,
        nextBookPageNumber: startBookPageNumber
    };

    if (!docFile) {
        docSummary.error = "无法读取书籍条目的文件路径。";
        result.summary.errorCount++;
        return docSummary;
    }

    if (!docFile.exists) {
        docSummary.error = "文档文件不存在。";
        result.summary.errorCount++;
        return docSummary;
    }

    var doc = null;
    var openedDocHere = false;
    var docSeen = {};

    try {
        var existingDoc = findOpenDocumentByPath(docFile);
        if (existingDoc) {
            doc = existingDoc;
        } else {
            doc = app.open(docFile, false);
            openedDocHere = true;
        }

        docSummary.documentName = valueOrBlank(safeRead(doc, "name")) || docFile.name;
        docSummary.documentPath =
            valueOrBlank(getFilePath(safeRead(doc, "fullName"))) || docFile.fsName;

        var pages = safeRead(doc, "pages");
        var pageCount = collectionLength(pages);
        docSummary.pageCount = pageCount;
        result.summary.pageCount += pageCount;

        for (var p = 0; p < pageCount; p++) {
            scanPage(
                result,
                docSummary,
                docSeen,
                pages[p],
                p + 1,
                docSummary.nextBookPageNumber
            );
            docSummary.nextBookPageNumber++;
        }

        var uniqueCount = 0;
        for (var key in docSeen) {
            if (docSeen.hasOwnProperty(key)) {
                uniqueCount++;
            }
        }
        docSummary.uniqueLinkedImageFileCount = uniqueCount;
    } catch (error) {
        docSummary.error =
            "扫描文档失败: " +
            error.message +
            (error.line ? " (行号: " + error.line + ")" : "");
        result.summary.errorCount++;
    } finally {
        if (openedDocHere && doc) {
            try {
                doc.close(SaveOptions.NO);
            } catch (closeDocError) {}
        }
    }

    return docSummary;
}

function scanPage(
    result,
    docSummary,
    docSeen,
    page,
    documentPageNumber,
    bookPageNumber
) {
    var graphics = safeRead(page, "allGraphics");
    var count = collectionLength(graphics);
    var pageName = valueOrBlank(safeRead(page, "name"));

    for (var i = 0; i < count; i++) {
        try {
            var graphic = graphics[i];
            addGraphicOccurrence(
                result,
                docSummary,
                docSeen,
                graphic,
                i + 1,
                pageName,
                documentPageNumber,
                bookPageNumber
            );
        } catch (error) {
            result.summary.errorCount++;
        }
    }
}

function addGraphicOccurrence(
    result,
    docSummary,
    docSeen,
    graphic,
    imageIndexOnPage,
    pageName,
    documentPageNumber,
    bookPageNumber
) {
    var link = safeRead(graphic, "itemLink");
    var linkPath = valueOrBlank(safeRead(link, "filePath"));
    var linkName = valueOrBlank(safeRead(link, "name"));
    var embedded = link ? false : true;

    result.summary.graphicPlacementCount++;
    docSummary.graphicPlacementCount++;

    var occurrence = {
        bookPageNumber: bookPageNumber,
        pageName: pageName,
        documentName: docSummary.documentName,
        documentPath: docSummary.documentPath,
        documentPageNumber: documentPageNumber,
        imageIndexOnPage: imageIndexOnPage,
        graphicType: getClassName(graphic),
        linkStatus: link ? enumToString(safeRead(link, "status")) : "",
        frame: collectFrameInfo(getGraphicFrame(graphic)),
        graphicBounds: boundsToObject(safeRead(graphic, "geometricBounds"))
    };

    if (embedded || (!linkPath && !linkName)) {
        result.summary.embeddedGraphicCount++;
        docSummary.embeddedGraphicCount++;
        result.embeddedGraphics.push(occurrence);
        return;
    }

    var key = makeImageKey(linkPath, linkName);
    var record = result.imageMap[key];
    if (!record) {
        record = {
            imageKey: key,
            linkName: linkName,
            linkPath: linkPath,
            fileBaseName: getBaseName(linkName || linkPath),
            occurrenceCount: 0,
            pages: [],
            occurrences: []
        };
        result.imageMap[key] = record;
        result.imageOrder.push(key);
    }

    record.occurrenceCount++;
    record.occurrences.push(occurrence);
    addPageIfMissing(record.pages, bookPageNumber, pageName);
    docSeen[key] = true;
}

function addPageIfMissing(pages, bookPageNumber, pageName) {
    for (var i = 0; i < pages.length; i++) {
        if (pages[i].bookPageNumber === bookPageNumber) {
            return;
        }
    }
    pages.push({
        bookPageNumber: bookPageNumber,
        pageName: pageName
    });
}

function collectFrameInfo(frame) {
    if (!frame) {
        return null;
    }

    return {
        type: getClassName(frame),
        name: valueOrBlank(safeRead(frame, "name")),
        label: valueOrBlank(safeRead(frame, "label")),
        id: valueOrBlank(safeRead(frame, "id")),
        layer: valueOrBlank(safeRead(safeRead(frame, "itemLayer"), "name")),
        bounds: boundsToObject(safeRead(frame, "geometricBounds"))
    };
}

function getGraphicFrame(graphic) {
    var parent = safeRead(graphic, "parent");
    if (!parent) {
        return null;
    }
    return parent;
}

function buildOutputFiles(folder, bookFile) {
    var baseName = sanitizeFileName(getBaseName(bookFile.name));
    if (!baseName) {
        baseName = "book";
    }

    var indexFile = File(folder.fsName + "/" + baseName + "_image_file_index.jsonl");
    var summaryFile = File(
        folder.fsName + "/" + baseName + "_image_file_index_summary.json"
    );
    if (!indexFile.exists && !summaryFile.exists) {
        return {
            index: indexFile,
            summary: summaryFile
        };
    }

    var timestamp = formatTimestamp(new Date());
    return {
        index: File(
            folder.fsName + "/" + baseName + "_image_file_index_" + timestamp + ".jsonl"
        ),
        summary: File(
            folder.fsName +
                "/" +
                baseName +
                "_image_file_index_summary_" +
                timestamp +
                ".json"
        )
    };
}

function writeImageIndexJSONL(file, result) {
    file.encoding = "UTF-8";
    file.lineFeed = "Unix";
    if (!file.open("w")) {
        throw new Error("无法写入文件:\n" + file.fsName);
    }

    try {
        for (var i = 0; i < result.imageOrder.length; i++) {
            var key = result.imageOrder[i];
            file.writeln(stringifyCompactJSON(result.imageMap[key]));
        }
    } finally {
        file.close();
    }
}

function buildSummaryOutput(result, outputFiles) {
    return {
        schemaVersion: result.schemaVersion,
        outputFormat: "JSONL/NDJSON",
        generatedAt: result.generatedAt,
        bookName: result.bookName,
        bookPath: result.bookPath,
        imageIndexFile: outputFiles.index.fsName,
        summaryFile: outputFiles.summary.fsName,
        summary: result.summary,
        documents: result.documents
    };
}

function getBookContentFile(bookContent) {
    var fullName = safeRead(bookContent, "fullName");
    if (fullName) {
        return File(fullName);
    }

    var filePath = safeRead(bookContent, "filePath");
    if (filePath) {
        return File(filePath);
    }

    return null;
}

function findOpenBookByPath(file) {
    var books = safeRead(app, "books");
    var count = collectionLength(books);
    for (var i = 0; i < count; i++) {
        try {
            var book = books[i];
            if (pathsEqual(getFilePath(safeRead(book, "fullName")), file.fsName)) {
                return book;
            }
        } catch (error) {}
    }
    return null;
}

function findOpenDocumentByPath(file) {
    var docs = safeRead(app, "documents");
    var count = collectionLength(docs);
    for (var i = 0; i < count; i++) {
        try {
            var doc = docs[i];
            if (pathsEqual(getFilePath(safeRead(doc, "fullName")), file.fsName)) {
                return doc;
            }
        } catch (error) {}
    }
    return null;
}

function makeImageKey(linkPath, linkName) {
    var key = linkPath ? linkPath : linkName;
    return normalizePath(key);
}

function writeTextFile(file, text) {
    file.encoding = "UTF-8";
    file.lineFeed = "Unix";
    if (!file.open("w")) {
        throw new Error("无法写入文件:\n" + file.fsName);
    }
    file.write(text);
    file.close();
}

function stringifyJSON(value) {
    if (typeof JSON !== "undefined" && JSON.stringify) {
        return JSON.stringify(value, null, 2);
    }
    return stringifyValue(value, 0);
}

function stringifyCompactJSON(value) {
    if (typeof JSON !== "undefined" && JSON.stringify) {
        return JSON.stringify(value);
    }
    return stringifyCompactValue(value);
}

function stringifyValue(value, indent) {
    var pad = repeat("  ", indent);
    var childPad = repeat("  ", indent + 1);

    if (value === null || value === undefined) {
        return "null";
    }

    var type = typeof value;
    if (type === "string") {
        return quoteJSONString(value);
    }
    if (type === "number") {
        return isFinite(value) ? String(value) : "null";
    }
    if (type === "boolean") {
        return value ? "true" : "false";
    }

    if (value instanceof Array) {
        if (value.length === 0) {
            return "[]";
        }
        var items = [];
        for (var i = 0; i < value.length; i++) {
            items.push(childPad + stringifyValue(value[i], indent + 1));
        }
        return "[\n" + items.join(",\n") + "\n" + pad + "]";
    }

    var keys = [];
    for (var key in value) {
        if (value.hasOwnProperty(key)) {
            keys.push(
                childPad +
                    quoteJSONString(key) +
                    ": " +
                    stringifyValue(value[key], indent + 1)
            );
        }
    }
    if (keys.length === 0) {
        return "{}";
    }
    return "{\n" + keys.join(",\n") + "\n" + pad + "}";
}

function stringifyCompactValue(value) {
    if (value === null || value === undefined) {
        return "null";
    }

    var type = typeof value;
    if (type === "string") {
        return quoteJSONString(value);
    }
    if (type === "number") {
        return isFinite(value) ? String(value) : "null";
    }
    if (type === "boolean") {
        return value ? "true" : "false";
    }

    if (value instanceof Array) {
        var items = [];
        for (var i = 0; i < value.length; i++) {
            items.push(stringifyCompactValue(value[i]));
        }
        return "[" + items.join(",") + "]";
    }

    var parts = [];
    for (var key in value) {
        if (value.hasOwnProperty(key)) {
            parts.push(quoteJSONString(key) + ":" + stringifyCompactValue(value[key]));
        }
    }
    return "{" + parts.join(",") + "}";
}

function quoteJSONString(value) {
    value = String(value);
    var out = '"';
    for (var i = 0; i < value.length; i++) {
        var ch = value.charAt(i);
        var code = value.charCodeAt(i);
        if (ch === '"') {
            out += '\\"';
        } else if (ch === "\\") {
            out += "\\\\";
        } else if (ch === "\b") {
            out += "\\b";
        } else if (ch === "\f") {
            out += "\\f";
        } else if (ch === "\n") {
            out += "\\n";
        } else if (ch === "\r") {
            out += "\\r";
        } else if (ch === "\t") {
            out += "\\t";
        } else if (code < 32) {
            out += "\\u" + padLeft(code.toString(16), 4);
        } else {
            out += ch;
        }
    }
    return out + '"';
}

function safeRead(obj, prop) {
    if (obj === null || obj === undefined) {
        return null;
    }
    try {
        return obj[prop];
    } catch (error) {
        return null;
    }
}

function collectionLength(collection) {
    try {
        if (collection && collection.length !== undefined) {
            return Number(collection.length);
        }
    } catch (error) {}
    return 0;
}

function getClassName(obj) {
    try {
        if (obj && obj.constructor && obj.constructor.name) {
            return obj.constructor.name;
        }
    } catch (error) {}

    try {
        return String(obj)
            .replace(/^\[object /, "")
            .replace(/\]$/, "");
    } catch (stringError) {
        return "";
    }
}

function getFilePath(fileLike) {
    if (!fileLike) {
        return "";
    }

    try {
        if (fileLike.fsName) {
            return fileLike.fsName;
        }
    } catch (error) {}

    return String(fileLike);
}

function pathsEqual(a, b) {
    return normalizePath(a) === normalizePath(b);
}

function normalizePath(path) {
    return String(path || "").replace(/\\/g, "/").toLowerCase();
}

function boundsToObject(bounds) {
    var values = arrayLikeToNumberArray(bounds);
    if (!values || values.length < 4) {
        return null;
    }
    return {
        top: values[0],
        left: values[1],
        bottom: values[2],
        right: values[3],
        width: values[3] - values[1],
        height: values[2] - values[0]
    };
}

function arrayLikeToNumberArray(value) {
    if (!value || value.length === undefined) {
        return null;
    }

    var out = [];
    for (var i = 0; i < value.length; i++) {
        var n = Number(value[i]);
        if (!isFinite(n)) {
            return null;
        }
        out.push(n);
    }
    return out;
}

function enumToString(value) {
    if (value === null || value === undefined) {
        return "";
    }
    try {
        return String(value);
    } catch (error) {
        return "";
    }
}

function valueOrBlank(value) {
    if (value === null || value === undefined) {
        return "";
    }
    return String(value);
}

function getBaseName(name) {
    name = valueOrBlank(name);
    return name.replace(/\.[^\.]+$/, "");
}

function sanitizeFileName(name) {
    return valueOrBlank(name)
        .replace(/[\/\\:\*\?"<>\|]/g, "_")
        .replace(/^\s+|\s+$/g, "");
}

function getScriptFolder() {
    try {
        if ($.fileName) {
            return File($.fileName).parent;
        }
    } catch (error) {}
    return Folder.current;
}

function formatDate(date) {
    return (
        date.getFullYear() +
        "-" +
        padLeft(date.getMonth() + 1, 2) +
        "-" +
        padLeft(date.getDate(), 2) +
        " " +
        padLeft(date.getHours(), 2) +
        ":" +
        padLeft(date.getMinutes(), 2) +
        ":" +
        padLeft(date.getSeconds(), 2)
    );
}

function formatTimestamp(date) {
    return (
        date.getFullYear() +
        padLeft(date.getMonth() + 1, 2) +
        padLeft(date.getDate(), 2) +
        "_" +
        padLeft(date.getHours(), 2) +
        padLeft(date.getMinutes(), 2) +
        padLeft(date.getSeconds(), 2)
    );
}

function padLeft(value, length) {
    value = String(value);
    while (value.length < length) {
        value = "0" + value;
    }
    return value;
}

function repeat(text, count) {
    var out = "";
    for (var i = 0; i < count; i++) {
        out += text;
    }
    return out;
}

try {
    main();
} catch (err) {
    var lineText = err.line ? "\n\n行号: " + err.line : "";
    alert("导出书籍图片文件索引失败:\n\n" + err.message + lineText);
}
