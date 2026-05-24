//@target indesign

/*
导出 InDesign Book (.indb) 中每个文档、每页图片/图形的链接信息到 JSON。
脚本只生成索引清单，不会导出或复制原始图片文件；默认建议把 JSON 保存到本脚本所在目录。
*/

(function () {
    // 让用户选择 .indb 文件
    var bookFile = File.openDialog("请选择 .indb 文件", "*.indb");
    if (!bookFile) return;

    // 输出 json 的位置：默认放在脚本所在目录
    var scriptFolder = getScriptFolder();
    var outputFile = File(
        scriptFolder.fsName + "/" + buildDefaultOutputName(bookFile)
    );
    outputFile = outputFile.saveDlg("保存 JSON 到...", "*.json");
    if (!outputFile) return;

    var book = app.open(bookFile);
    var result = {
        bookName: book.name,
        bookPath: book.fullName.fsName,
        documents: []
    };

    // 遍历 book 中的每一个 indd
    for (var i = 0; i < book.bookContents.length; i++) {
        var bc = book.bookContents[i];
        var docFile = File(bc.fullName);

        if (!docFile.exists) {
            result.documents.push({
                fileName: bc.name,
                error: "文件未找到"
            });
            continue;
        }

        var doc = app.open(docFile, false); // false = 不显示窗口，更快

        var docInfo = {
            fileName: doc.name,
            filePath: doc.fullName.fsName,
            pages: []
        };

        // 遍历每一页
        for (var p = 0; p < doc.pages.length; p++) {
            var page = doc.pages[p];
            var pageInfo = {
                pageName: page.name, // 页面显示的页码（如 "iv", "12"）
                pageIndex: p, // 在文档中的索引
                documentOffset: page.documentOffset, // 在 book 中的整体页码
                images: []
            };

            // allGraphics 包含 page 上所有的图（Image, PDF, EPS, WMF 等）
            var graphics = page.allGraphics;
            for (var g = 0; g < graphics.length; g++) {
                var gr = graphics[g];
                var imgInfo = {
                    type: gr.constructor.name // Image / PDF / EPS / Graphic
                };

                // itemLink 包含链接文件的信息
                try {
                    if (gr.itemLink !== null) {
                        imgInfo.linkName = gr.itemLink.name;
                        imgInfo.linkPath = gr.itemLink.filePath;
                        imgInfo.linkStatus = String(gr.itemLink.status);
                        imgInfo.linkSize = gr.itemLink.size;
                    } else {
                        imgInfo.embedded = true;
                    }
                } catch (e) {
                    imgInfo.linkError = e.message;
                }

                // 图像在页面上的位置（geometricBounds: [y1, x1, y2, x2]）
                try {
                    imgInfo.bounds = gr.geometricBounds;
                } catch (e) {}

                pageInfo.images.push(imgInfo);
            }

            docInfo.pages.push(pageInfo);
        }

        result.documents.push(docInfo);
        doc.close(SaveOptions.NO); // 不保存改动
    }

    book.close(SaveOptions.NO);

    // 写入 JSON
    // ExtendScript 没有原生 JSON，但 InDesign 自带支持，否则手动序列化
    var jsonStr;
    if (typeof JSON !== "undefined") {
        jsonStr = JSON.stringify(result, null, 2);
    } else {
        jsonStr = simpleStringify(result, 0);
    }

    outputFile.encoding = "UTF-8";
    outputFile.open("w");
    outputFile.write(jsonStr);
    outputFile.close();

    alert("完成！JSON 已保存到：\n" + outputFile.fsName);

    // 备用 JSON 序列化（如果 JSON 对象不存在）
    function simpleStringify(obj, indent) {
        var pad = "";
        for (var k = 0; k < indent; k++) pad += "  ";
        var pad2 = pad + "  ";

        if (obj === null) return "null";
        if (typeof obj === "string")
            return (
                '"' +
                obj
                    .replace(/\\/g, "\\\\")
                    .replace(/"/g, '\\"')
                    .replace(/\n/g, "\\n") +
                '"'
            );
        if (typeof obj === "number" || typeof obj === "boolean")
            return String(obj);

        if (obj instanceof Array) {
            if (obj.length === 0) return "[]";
            var items = [];
            for (var i = 0; i < obj.length; i++) {
                items.push(pad2 + simpleStringify(obj[i], indent + 1));
            }
            return "[\n" + items.join(",\n") + "\n" + pad + "]";
        }

        if (typeof obj === "object") {
            var keys = [];
            for (var key in obj) {
                if (obj.hasOwnProperty(key)) {
                    keys.push(
                        pad2 +
                            '"' +
                            key +
                            '": ' +
                            simpleStringify(obj[key], indent + 1)
                    );
                }
            }
            if (keys.length === 0) return "{}";
            return "{\n" + keys.join(",\n") + "\n" + pad + "}";
        }

        return '""';
    }

    function getScriptFolder() {
        try {
            if ($.fileName) {
                return File($.fileName).parent;
            }
        } catch (e) {}
        return Folder.current;
    }

    function buildDefaultOutputName(file) {
        var name = file.displayName || file.name || "book";
        name = name.replace(/\.[^\.]+$/, "");
        return name + "_image_links.json";
    }
})();
