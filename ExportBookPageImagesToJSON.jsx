/*
  ExportBookPageImagesToJSON.jsx

  Select an InDesign Book (.indb), scan every document/page in book order,
  and write JSONL/NDJSON page records in this script folder.
*/

function main() {
    alert(
        "脚本已启动。\n\n" +
            "下一步请选择一个 .indb 书籍文件。\n" +
            "如果点确定后没有出现文件选择窗口，请告诉我。"
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
        result.outputFile = outputFiles.pages.fsName;
        result.summaryFile = outputFiles.summary.fsName;

        writePageJSONL(outputFiles.pages, result);
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
            "\n图片数: " +
            result.summary.imageCount;
        if (result.summary.errorCount > 0) {
            completionMessage += "\n错误数: " + result.summary.errorCount;
        }
        completionMessage +=
            "\n\nJSONL/NDJSON 已保存到:\n" +
            outputFiles.pages.fsName +
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
            imageCount: 0,
            errorCount: 0
        },
        documents: [],
        pages: []
    };

    var contents = safeRead(book, "bookContents");
    var contentCount = collectionLength(contents);
    var bookPageIndex = 0;

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

        var docInfo = scanBookContent(bookContent, i + 1, bookPageIndex);
        bookPageIndex = docInfo.nextBookPageIndex;
        docInfo.nextBookPageIndex = undefined;

        result.documents.push(docInfo);
        result.summary.documentCount++;
        result.summary.pageCount += docInfo.pages.length;
        result.summary.imageCount += docInfo.imageCount || 0;
        if (docInfo.error) {
            result.summary.errorCount++;
        }

        for (var p = 0; p < docInfo.pages.length; p++) {
            result.pages.push({
                bookPageNumber: docInfo.pages[p].bookPageNumber,
                pageName: docInfo.pages[p].pageName,
                documentName: docInfo.documentName,
                documentPath: docInfo.documentPath,
                documentPageNumber: docInfo.pages[p].documentPageNumber,
                imageCount: docInfo.pages[p].imageCount,
                images: docInfo.pages[p].images
            });
        }
    }

    return result;
}

function scanBookContent(bookContent, bookDocumentIndex, startBookPageIndex) {
    var docFile = getBookContentFile(bookContent);
    var docInfo = {
        bookDocumentIndex: bookDocumentIndex,
        bookContentName: valueOrBlank(safeRead(bookContent, "name")),
        documentName: "",
        documentPath: docFile ? docFile.fsName : "",
        bookPageRange: valueOrBlank(safeRead(bookContent, "documentPageRange")),
        pages: [],
        imageCount: 0,
        nextBookPageIndex: startBookPageIndex
    };

    if (!docFile) {
        docInfo.error = "无法读取书籍条目的文件路径。";
        return docInfo;
    }

    if (!docFile.exists) {
        docInfo.error = "文档文件不存在。";
        return docInfo;
    }

    var doc = null;
    var openedDocHere = false;

    try {
        var existingDoc = findOpenDocumentByPath(docFile);
        if (existingDoc) {
            doc = existingDoc;
        } else {
            doc = app.open(docFile, false);
            openedDocHere = true;
        }

        docInfo.documentName = valueOrBlank(safeRead(doc, "name")) || docFile.name;
        docInfo.documentPath =
            valueOrBlank(getFilePath(safeRead(doc, "fullName"))) || docFile.fsName;

        var pages = safeRead(doc, "pages");
        var pageCount = collectionLength(pages);

        for (var p = 0; p < pageCount; p++) {
            var page = pages[p];
            var pageInfo = scanPage(
                page,
                docInfo,
                p + 1,
                docInfo.nextBookPageIndex + 1
            );
            docInfo.nextBookPageIndex++;
            docInfo.pages.push(pageInfo);
            docInfo.imageCount += pageInfo.imageCount;
        }
    } catch (error) {
        docInfo.error =
            "扫描文档失败: " +
            error.message +
            (error.line ? " (行号: " + error.line + ")" : "");
    } finally {
        if (openedDocHere && doc) {
            try {
                doc.close(SaveOptions.NO);
            } catch (closeDocError) {}
        }
    }

    return docInfo;
}

function scanPage(page, docInfo, documentPageIndex, bookPageIndex) {
    var pageInfo = {
        bookPageNumber: bookPageIndex,
        documentPageNumber: documentPageIndex,
        pageName: valueOrBlank(safeRead(page, "name")),
        pageId: valueOrBlank(safeRead(page, "id")),
        imageCount: 0,
        images: []
    };

    var graphics = safeRead(page, "allGraphics");
    var count = collectionLength(graphics);
    for (var i = 0; i < count; i++) {
        try {
            var graphic = graphics[i];
            var imageInfo = collectGraphicInfo(graphic, i + 1);
            pageInfo.images.push(imageInfo);
        } catch (error) {
            pageInfo.images.push({
                imageIndexOnPage: i + 1,
                error: "读取图片失败: " + error
            });
        }
    }

    pageInfo.imageCount = pageInfo.images.length;
    return pageInfo;
}

function collectGraphicInfo(graphic, imageIndexOnPage) {
    var link = safeRead(graphic, "itemLink");
    var parentFrame = getGraphicFrame(graphic);
    var linkPath = valueOrBlank(safeRead(link, "filePath"));
    var linkName = valueOrBlank(safeRead(link, "name"));

    var info = {
        imageIndexOnPage: imageIndexOnPage,
        graphicType: getClassName(graphic),
        linkName: linkName,
        linkPath: linkPath,
        fileBaseName: getBaseName(linkName),
        embedded: link ? false : true,
        linkStatus: link ? enumToString(safeRead(link, "status")) : "",
        frame: collectFrameInfo(parentFrame),
        graphicBounds: boundsToObject(safeRead(graphic, "geometricBounds"))
    };

    var actualPpi = arrayLikeToNumberArray(safeRead(graphic, "actualPpi"));
    if (actualPpi) {
        info.actualPpi = actualPpi;
    }

    var effectivePpi = arrayLikeToNumberArray(safeRead(graphic, "effectivePpi"));
    if (effectivePpi) {
        info.effectivePpi = effectivePpi;
    }

    return info;
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

    var className = getClassName(parent);
    if (
        className === "Rectangle" ||
        className === "Oval" ||
        className === "Polygon" ||
        className === "GraphicLine" ||
        className === "TextFrame"
    ) {
        return parent;
    }

    return parent;
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

function buildOutputFiles(folder, bookFile) {
    var baseName = sanitizeFileName(getBaseName(bookFile.name));
    if (!baseName) {
        baseName = "book";
    }

    var jsonlFile = File(folder.fsName + "/" + baseName + "_page_images.jsonl");
    var summaryFile = File(folder.fsName + "/" + baseName + "_page_images_summary.json");
    if (!jsonlFile.exists && !summaryFile.exists) {
        return {
            pages: jsonlFile,
            summary: summaryFile
        };
    }

    var timestamp = formatTimestamp(new Date());
    return {
        pages: File(
            folder.fsName + "/" + baseName + "_page_images_" + timestamp + ".jsonl"
        ),
        summary: File(
            folder.fsName +
                "/" +
                baseName +
                "_page_images_summary_" +
                timestamp +
                ".json"
        )
    };
}

function writePageJSONL(file, result) {
    file.encoding = "UTF-8";
    file.lineFeed = "Unix";
    if (!file.open("w")) {
        throw new Error("无法写入文件:\n" + file.fsName);
    }

    try {
        for (var i = 0; i < result.pages.length; i++) {
            file.writeln(stringifyCompactJSON(result.pages[i]));
        }
    } finally {
        file.close();
    }
}

function buildSummaryOutput(result, outputFiles) {
    var documents = [];
    for (var i = 0; i < result.documents.length; i++) {
        var doc = result.documents[i];
        documents.push({
            bookDocumentIndex: doc.bookDocumentIndex,
            bookContentName: doc.bookContentName,
            documentName: doc.documentName,
            documentPath: doc.documentPath,
            bookPageRange: doc.bookPageRange,
            pageCount: doc.pages ? doc.pages.length : 0,
            imageCount: doc.imageCount || 0,
            error: doc.error || ""
        });
    }

    return {
        schemaVersion: result.schemaVersion,
        outputFormat: "JSONL/NDJSON",
        generatedAt: result.generatedAt,
        bookName: result.bookName,
        bookPath: result.bookPath,
        pageRecordsFile: outputFiles.pages.fsName,
        summaryFile: outputFiles.summary.fsName,
        summary: result.summary,
        documents: documents
    };
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
    alert("导出书籍图片索引失败:\n\n" + err.message + lineText);
}
