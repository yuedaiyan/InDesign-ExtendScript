/**
 * ReplaceSelectedImagesFromFolder.jsx
 *
 * 用新文件夹中同名文件替换当前选中图片框里已有的置入图片。
 * - 运行前先选中一个页面/跨页上的若干图片框（Rectangle / Oval / Polygon）
 * - 已有置入图片的框架会按原图片文件名去新文件夹里找替换文件
 * - 空图片框会被跳过并保持为空
 * - 优先匹配完整文件名；找不到时，使用去掉扩展名后的同名文件做唯一匹配
 * - 替换动作会被包装为一次撤销操作
 */

(function () {
    try {
        main();
    } catch (err) {
        var msg = "脚本执行失败。";
        if (err && err.message) msg += "\n\n" + err.message;
        if (err && err.line) msg += "\n行号: " + err.line;
        alert(msg);
    }

    function main() {
        var SUPPORTED_EXTENSIONS = [
            ".jpg",
            ".jpeg",
            ".png",
            ".tif",
            ".tiff",
            ".psd",
            ".pdf",
            ".ai",
            ".eps",
            ".gif"
        ];

        if (app.documents.length === 0) {
            alert("请先打开一个 InDesign 文档。");
            return;
        }

        if (app.selection.length === 0) {
            alert("请先选中一个或多个图片框，然后再运行脚本。");
            return;
        }

        var selectedFrames = collectSelectedGraphicFrames(app.selection);
        if (selectedFrames.length === 0) {
            alert(
                "当前选区里没有找到图片框。\n\n" +
                    "请选中 Rectangle / Oval / Polygon 图片框；锁定对象、锁定图层或隐藏图层上的对象会被忽略。"
            );
            return;
        }

        var folder = Folder.selectDialog("请选择存放新替换图片的文件夹");
        if (folder === null) return;

        var folderIndex = buildFolderIndex(folder, SUPPORTED_EXTENSIONS);
        if (folderIndex.fileCount === 0) {
            alert("所选文件夹内没有找到支持的图片文件。");
            return;
        }

        var plan = buildReplacementPlan(selectedFrames, folderIndex);
        if (plan.filledCount === 0) {
            alert("选中的图片框都是空的，没有需要替换的已置入图片。");
            return;
        }

        if (plan.replacements.length === 0) {
            var noneMsg =
                "没有找到任何可替换的同名文件。\n\n" +
                "已检查已填充图片框: " +
                plan.filledCount +
                " 个\n" +
                "空框架已跳过: " +
                plan.emptyCount +
                " 个\n" +
                "所选文件夹支持文件: " +
                folderIndex.fileCount +
                " 个";
            noneMsg += buildIssuePreview("\n\n找不到/有歧义的文件:", plan.issues, 12);
            alert(noneMsg);
            return;
        }

        var confirmMsg =
            "选中图片框: " +
            selectedFrames.length +
            " 个\n" +
            "已填充图片框: " +
            plan.filledCount +
            " 个\n" +
            "空框架将跳过: " +
            plan.emptyCount +
            " 个\n" +
            "找到可替换文件: " +
            plan.replacements.length +
            " 个\n" +
            "找不到或有歧义: " +
            plan.issues.length +
            " 个\n\n";
        confirmMsg += buildReplacementPreview(plan.replacements, 10);
        if (plan.issues.length > 0) {
            confirmMsg += buildIssuePreview("\n\n不会处理的文件:", plan.issues, 8);
        }
        confirmMsg += "\n\n是否继续替换？";

        if (!confirm(confirmMsg)) return;

        var successCount = 0;
        var failedList = [];

        app.doScript(
            function () {
                var oldRedraw = app.scriptPreferences.enableRedraw;
                app.scriptPreferences.enableRedraw = false;
                try {
                    for (var i = 0; i < plan.replacements.length; i++) {
                        var item = plan.replacements[i];
                        try {
                            item.link.relink(item.newFile);
                            try {
                                item.link.update();
                            } catch (updateErr) {}
                            successCount++;
                        } catch (replaceErr) {
                            failedList.push(
                                item.oldName + " -> " + item.newFile.name + " 替换失败: " + replaceErr.message
                            );
                        }
                    }
                } finally {
                    app.scriptPreferences.enableRedraw = oldRedraw;
                }
            },
            ScriptLanguage.JAVASCRIPT,
            undefined,
            UndoModes.ENTIRE_SCRIPT,
            "用同名文件替换选中图片"
        );

        var report = "完成。\n\n";
        report += "已填充图片框: " + plan.filledCount + " 个\n";
        report += "空框架已跳过: " + plan.emptyCount + " 个\n";
        report += "成功替换: " + successCount + " 个\n";
        if (plan.issues.length > 0) {
            report += "未处理: " + plan.issues.length + " 个\n";
        }
        if (failedList.length > 0) {
            report += "\n失败: " + failedList.length + " 项\n";
            report += listPreview(failedList, 20);
        }
        if (plan.issues.length > 0) {
            report += buildIssuePreview("\n未处理明细:", plan.issues, 20);
        }
        report += "\n\n需要撤销时，按一次 Cmd+Z 即可撤销本次全部替换。";
        alert(report);
    }

    function collectSelectedGraphicFrames(selection) {
        var frames = [];
        var seen = {};

        for (var i = 0; i < selection.length; i++) {
            collectGraphicFramesFromItem(selection[i], frames, seen);
        }

        return frames;
    }

    function collectGraphicFramesFromItem(item, frames, seen) {
        if (!item) return;

        var frame = getGraphicFrameFromItem(item);
        if (frame !== null) {
            addFrameOnce(frame, frames, seen);
            return;
        }

        try {
            if (item.pageItems && item.pageItems.length > 0) {
                for (var p = 0; p < item.pageItems.length; p++) {
                    collectGraphicFramesFromItem(item.pageItems[p], frames, seen);
                }
            }
        } catch (e1) {}

        try {
            if (item.allPageItems && item.allPageItems.length > 0) {
                for (var a = 0; a < item.allPageItems.length; a++) {
                    collectGraphicFramesFromItem(item.allPageItems[a], frames, seen);
                }
            }
        } catch (e2) {}
    }

    function getGraphicFrameFromItem(item) {
        if (isGraphicFrame(item)) return item;

        try {
            if (item.parent && isGraphicFrame(item.parent)) {
                return item.parent;
            }
        } catch (e1) {}

        return null;
    }

    function addFrameOnce(frame, frames, seen) {
        var key = getItemKey(frame);
        if (key !== null) {
            if (seen[key]) return;
            seen[key] = true;
        }
        frames.push(frame);
    }

    function getItemKey(item) {
        try {
            if (item.id !== undefined && item.id !== null) {
                return "id:" + item.id;
            }
        } catch (e1) {}
        try {
            return "spec:" + item.toSpecifier();
        } catch (e2) {}
        return null;
    }

    function isGraphicFrame(item) {
        if (!item) return false;

        var typeName = "";
        try {
            typeName = item.constructor.name;
        } catch (e0) {
            return false;
        }

        if (typeName !== "Rectangle" && typeName !== "Oval" && typeName !== "Polygon") {
            return false;
        }

        try {
            if (item.contentType === ContentType.TEXT_TYPE) return false;
        } catch (e1) {}

        try {
            if (item.locked) return false;
            if (item.itemLayer.locked || !item.itemLayer.visible) return false;
        } catch (e2) {}

        return true;
    }

    function buildReplacementPlan(frames, folderIndex) {
        var plan = {
            filledCount: 0,
            emptyCount: 0,
            replacements: [],
            issues: []
        };

        for (var i = 0; i < frames.length; i++) {
            var info = getPlacedGraphicInfo(frames[i]);
            if (info.status === "empty") {
                plan.emptyCount++;
                continue;
            }
            if (info.status !== "ok") {
                plan.filledCount++;
                plan.issues.push(info.message);
                continue;
            }

            plan.filledCount++;
            var matched = findReplacementFile(info.name, folderIndex);
            if (matched.status === "ok") {
                plan.replacements.push({
                    frame: frames[i],
                    link: info.link,
                    oldName: info.name,
                    newFile: matched.file,
                    matchKind: matched.matchKind
                });
            } else {
                plan.issues.push(info.name + " - " + matched.message);
            }
        }

        return plan;
    }

    function getPlacedGraphicInfo(frame) {
        var graphics;
        try {
            graphics = frame.graphics;
        } catch (e1) {
            return {
                status: "error",
                message: "某个选中框架无法读取 graphics，已跳过"
            };
        }
        if (!graphics || graphics.length === 0) {
            return {
                status: "empty"
            };
        }

        var graphic = null;
        try {
            graphic = graphics[0];
        } catch (e2) {
            return {
                status: "error",
                message: "某个已填充框架无法读取置入内容"
            };
        }
        if (!graphic) {
            return {
                status: "error",
                message: "某个已填充框架无法读取置入内容"
            };
        }

        var link = null;
        try {
            link = graphic.itemLink;
        } catch (e3) {}
        if (!link) {
            return {
                status: "error",
                message: "某个已填充框架没有可读取的链接，无法按文件名替换"
            };
        }

        var name = "";
        try {
            name = link.name;
        } catch (e4) {}
        name = trim(name);
        if (name === "") {
            return {
                status: "error",
                message: "某个已填充框架的链接文件名为空，无法替换"
            };
        }

        return {
            status: "ok",
            link: link,
            name: name
        };
    }

    function buildFolderIndex(folder, supportedExtensions) {
        var allFiles = folder.getFiles();
        var index = {
            fileCount: 0,
            exact: {},
            base: {}
        };

        for (var i = 0; i < allFiles.length; i++) {
            var f = allFiles[i];
            if (!(f instanceof File)) continue;
            if (!isSupportedImageFile(f, supportedExtensions)) continue;

            index.fileCount++;
            addToIndex(index.exact, normalizeName(f.name), f);
            addToIndex(index.base, normalizeName(removeExtension(f.name)), f);

            var decoded = safeDecodeName(f.name);
            if (decoded !== f.name) {
                addToIndex(index.exact, normalizeName(decoded), f);
                addToIndex(index.base, normalizeName(removeExtension(decoded)), f);
            }
        }

        return index;
    }

    function addToIndex(index, key, file) {
        if (key === "") return;
        if (!index[key]) index[key] = [];
        index[key].push(file);
    }

    function findReplacementFile(oldName, folderIndex) {
        var exactKey = normalizeName(oldName);
        var exactMatches = folderIndex.exact[exactKey];
        if (exactMatches && exactMatches.length === 1) {
            return {
                status: "ok",
                file: exactMatches[0],
                matchKind: "exact"
            };
        }
        if (exactMatches && exactMatches.length > 1) {
            return {
                status: "ambiguous",
                message: "完整文件名匹配到多个文件"
            };
        }

        var decodedName = safeDecodeName(oldName);
        if (decodedName !== oldName) {
            exactMatches = folderIndex.exact[normalizeName(decodedName)];
            if (exactMatches && exactMatches.length === 1) {
                return {
                    status: "ok",
                    file: exactMatches[0],
                    matchKind: "exact"
                };
            }
            if (exactMatches && exactMatches.length > 1) {
                return {
                    status: "ambiguous",
                    message: "完整文件名匹配到多个文件"
                };
            }
        }

        var baseMatches = folderIndex.base[normalizeName(removeExtension(oldName))];
        if (!baseMatches && decodedName !== oldName) {
            baseMatches = folderIndex.base[normalizeName(removeExtension(decodedName))];
        }
        if (baseMatches && baseMatches.length === 1) {
            return {
                status: "ok",
                file: baseMatches[0],
                matchKind: "base"
            };
        }
        if (baseMatches && baseMatches.length > 1) {
            return {
                status: "ambiguous",
                message: "去掉扩展名后匹配到多个文件"
            };
        }

        return {
            status: "missing",
            message: "所选文件夹中没有同名文件"
        };
    }

    function isSupportedImageFile(file, supportedExtensions) {
        var nameLower = file.name.toLowerCase();
        for (var i = 0; i < supportedExtensions.length; i++) {
            var ext = supportedExtensions[i];
            if (nameLower.lastIndexOf(ext) === nameLower.length - ext.length) {
                return true;
            }
        }
        return false;
    }

    function buildReplacementPreview(replacements, maxCount) {
        var lines = ["替换预览:"];
        var count = Math.min(replacements.length, maxCount);
        for (var i = 0; i < count; i++) {
            var item = replacements[i];
            var suffix = item.matchKind === "base" ? " (同基础名)" : "";
            lines.push("- " + item.oldName + " -> " + item.newFile.name + suffix);
        }
        if (replacements.length > maxCount) {
            lines.push("... 还有 " + (replacements.length - maxCount) + " 个未显示");
        }
        return lines.join("\n");
    }

    function buildIssuePreview(title, issues, maxCount) {
        if (issues.length === 0) return "";
        var lines = [title];
        var count = Math.min(issues.length, maxCount);
        for (var i = 0; i < count; i++) {
            lines.push("- " + issues[i]);
        }
        if (issues.length > maxCount) {
            lines.push("... 还有 " + (issues.length - maxCount) + " 项未显示");
        }
        return lines.join("\n");
    }

    function listPreview(items, maxCount) {
        var lines = [];
        var count = Math.min(items.length, maxCount);
        for (var i = 0; i < count; i++) {
            lines.push("- " + items[i]);
        }
        if (items.length > maxCount) {
            lines.push("... 还有 " + (items.length - maxCount) + " 项未显示");
        }
        return lines.join("\n");
    }

    function removeExtension(name) {
        var dot = String(name).lastIndexOf(".");
        if (dot > 0) return String(name).substring(0, dot);
        return String(name);
    }

    function normalizeName(name) {
        return trim(name).toLowerCase();
    }

    function safeDecodeName(name) {
        try {
            return decodeURI(String(name));
        } catch (e) {
            return String(name);
        }
    }

    function trim(value) {
        return String(value).replace(/^\s+|\s+$/g, "");
    }
})();
