# InDesign Scripts Panel 脚本目录

这个目录是 Adobe InDesign 的 Scripts Panel 脚本目录，主要保存可以在 InDesign 里直接双击运行的 ExtendScript / JSX 工具。当前文件已经按用途整理成两层：

- 根目录：通用排版、置图、替换、复制、检查、导出工具。
- `Graduation_Design_2026-05/`：毕业设计 2026-05 项目专用脚本和项目数据文件。

除 `lineNumber.py` 外，脚本基本都需要在 InDesign 中运行。很多会先检查当前文档、选区、页面范围或外部 JSON / 图片文件，然后用 `app.doScript(..., UndoModes.ENTIRE_SCRIPT, ...)` 包装实际修改，因此通常可以用一次 `Cmd+Z` 撤销本次批处理。

本文档根据当前文件内容静态整理，没有在 InDesign 现场逐个运行验证。

## 使用前约定

- 页码输入一般使用 InDesign 页面面板里显示的页码，也就是 `page.name`，不是单纯的文档物理顺序。
- 批量修改类脚本通常会在真正写入、删除、置入前给出预览或确认；如果没有弹窗，优先检查脚本是否在正确目录、是否刷新了 Scripts Panel、是否选中了脚本要求的对象。
- JSON 驱动脚本通常优先读取脚本同目录下的 JSON 文件；部分旧脚本仍写有固定绝对路径，使用前要确认路径存在。
- 图片置入脚本支持常见图片和矢量格式：`jpg`、`jpeg`、`png`、`tif`、`tiff`、`psd`、`pdf`、`ai`、`eps`、`gif`，部分脚本还支持 `svg`。
- 大范围删除、替换、跨文件复制前，建议先保存文档。虽然多数脚本支持一次撤销，但 InDesign 批处理失败时仍可能留下部分结果。

## 根目录通用脚本

| 文件 | 作用 | 运行前需要 |
| --- | --- | --- |
| `BatchPlaceImages.jsx` | 从图片文件夹或指定起始图片开始，按文件名自然排序，把图片批量置入文档里的空图片框。可选择从当前选中框、指定页码或文档第一个空框开始，也可选择填充/适合方式。 | 打开文档；可选中一个起始空图片框。 |
| `PlaceImagesIntoSelectedEmptyFrames.jsx` | 把图片文件夹中的图片置入当前选中的空图片框；同时按阅读顺序把框架 `name` 和 `label` 写成 `基础标签_1`、`基础标签_2`。图片不足时，剩余框只命名和打标签。 | 选中一个或多个空 Rectangle / Oval / Polygon 图片框。 |
| `PlaceImagesAcrossPagesIntoNamedEmptyFrames.jsx` | 从选中起始页开始，逐页收集空图片框，按框架名称中的数字结构排序，再把多选图片按文件名顺序置入。执行前会展示逐页置入计划。 | 只选中一个起始空图片框；各页空框名称要包含可排序数字。 |
| `ReplaceSelectedImagesFromFolder.jsx` | 用新文件夹中的同名文件替换当前选中图片框里已有的置入图片。优先匹配完整文件名，找不到时用去扩展名后的唯一同名文件匹配。 | 选中一个或多个已有图片的图片框或包含图片框的组。 |
| `ReplaceMissingImagesFromFolder.jsx` | 扫描当前文档中缺失链接的图片，从指定文件夹里按文件名寻找替换文件，并批量重新置入/更新。脚本会显示可替换和不可处理项目。 | 打开包含缺失链接的文档；选择替换图片文件夹。 |
| `ExportBookImageFileIndexToJSONL.jsx` | 多选 `.indd` 文件，统计每个唯一链接图片文件出现在哪些文档和页码，输出 JSONL/NDJSON 索引和 summary JSON。 | 选择一个或多个 InDesign 文件。 |
| `CopySelectionToPagesKeepLayers.jsx` | 把当前跨页上选中的对象复制到指定目标跨页，保持相对跨页位置，并尽量保留原图层。 | 在同一跨页上选中要复制的页面对象。 |
| `MoveContentAcrossFiles.jsx` | 在两个已打开文档之间，按指定源/目标图层和页码范围批量复制页面对象。默认会弹出设置窗口，也可改脚本顶部配置后直接执行。 | 至少打开源文档和目标文档；确认文档名、图层名、页码范围。 |
| `SortSelectedItemsByReadingOrder.jsx` | 将同一跨页、同一图层内的选中对象按阅读顺序排序，依次重命名并写入脚本标签；第一个对象会排到当前图层最前。 | 在同一跨页、同一图层选中要排序的页面对象。 |
| `FillSelectedTextFrameWithSpreadDateRange.jsx` | 扫描当前选中文本框所在跨页里的有效 `YYYY-MM-DD` 日期，去重排序后把最小日期和最大日期写入选中文本框，格式为 `min—max`。 | 选中一个目标文本框；同跨页存在日期文本。 |
| `FillDateRangeByPositionAcrossPages.jsx` | 以当前选中文本框的位置为锚点，在用户输入的页码范围内寻找相同位置的文本框，并分别填入其所在跨页的日期范围。 | 选中一个作为位置模板的文本框；输入页码范围。 |
| `DeleteDuplicateTextFramesBySelectedContent.jsx` | 以当前选中文本框内容为准，扫描当前文档中其他内容完全相同、可见且未锁定的文本框，确认后删除重复项。 | 选中一个文本框；确认删除预览。 |
| `RemoveAllGrid.jsx` | 删除当前活动文档中的全部参考线。脚本会先统计参考线数量并弹出确认，删除动作支持一次撤销。 | 打开文档；确认删除全部参考线。 |
| `InspectSelectedStructure.jsx` | 输出当前选中对象或组的树状结构，包括类型、名称、id、label、页码、图层、边界、文本摘要和图像链接信息，并支持复制到剪贴板。 | 选中一个或多个对象或组。 |
| `TagSwatchUtils.jsx` | 按脚本顶部 `TEMPLATE_NAME` 创建一组 RGB Process 色板。内置 `tag_colors`、`sample_warm`、`sample_cool`。 | 打开文档；需要时先修改 `TEMPLATE_NAME`。 |
| `lineNumber.py` | 生成从 `start` 到 `end` 的连续数字，每行一个，并复制到剪贴板。它是 Python 辅助脚本，不在 InDesign 内运行。 | 本机 Python 环境有 `pyperclip`；按需修改脚本顶部数字。 |

## 毕业设计项目目录

`Graduation_Design_2026-05/` 保存毕业设计项目专用自动化。这里的脚本多数围绕日记 JSON、人物索引 JSON、图片链接索引 JSONL 和固定版式模板运行。

### 主要入口脚本

| 文件 | 作用 | 运行前需要 |
| --- | --- | --- |
| `Graduation_Design_2026-05/BatchPlaceImagesByMonth.jsx` | 按 `YYYY-MM-DD[_N]` 文件名识别月份，按月批量置入图片；每个新月份复制分隔条模板并写入 `YYYY-MM`，空月份也会留出分隔。 | 同时选中分隔条 Group 模板和起始空图片框；选择图片文件夹。 |
| `Graduation_Design_2026-05/FillTextFromImageNames.jsx` | 将右侧图片组中已置入图片的文件名写入左侧文本组中对应位置的文本框；按用户输入页码范围批量处理偶数页文本组和奇数页图片组。 | 跨页同时选中一个文本框组和一个图片框组。 |
| `Graduation_Design_2026-05/fill_diary_info_from_json.jsx` | 扫描文档中内容像日期的文本框，读取固定路径 `/Users/yuedaiyan/code_school/biue_All/diary_entries.json`，按日期和 `_2` 这类序号匹配日记条目，并写入日期、地点、时间段。 | 打开文档；确认固定 JSON 路径存在。 |
| `Graduation_Design_2026-05/FillPeopleIndexTableFromJSON.jsx` | 读取同目录 `diary_people_index.json`，按 JSON 顺序写入 `label<TAB>abbreviation<TAB>count` 到选中文本框；串接文本框会替换整条 story。 | 选中一个文本框；同目录有 `diary_people_index.json`。 |
| `Graduation_Design_2026-05/GenerateTagLabelsFromJSON.jsx` | 读取同目录 `diary_entries.merged.json` 的 `tags` 字段，复制标签模板生成事件/情绪标签，按 tag 色表设置文本框背景色，并把同一 entry 的标签编组。 | 选中一个标签模板 Group；输入生成对象标签和起始 JSON `id`。 |
| `Graduation_Design_2026-05/GeneratePeopleTagLabelsFromJSON.jsx` | 读取 `diary_entries.merged.json` 的 `people_tags`，再用 `diary_people_index.json` 将人名映射为人物 label，复制人物标签模板生成编号标签。 | 选中人物标签模板 Group；同目录有日记 JSON 和人物索引 JSON。 |
| `Graduation_Design_2026-05/GenerateWeatherTextFramesFromJSON.jsx` | 读取 `diary_entries.merged.json` 的 `weather` 字段，复制天气文本框或 Group 模板生成天气信息。对象型 weather 会格式化成多行 tab 对齐文本。 | 选中天气文本框模板或包含文本框的 Group。 |
| `Graduation_Design_2026-05/AutoFillDiaryMetaFromTopImage.jsx` | 按页面范围寻找可编辑文本框正上方同一列的最高图片，从图片文件名解析日期和可选序号，在 `diary_entries.merged.json` 中找条目，并写入日记元信息。 | 输入页码范围；选择或确认 `diary_entries.merged.json`。 |
| `Graduation_Design_2026-05/AutoBuildImageIndexFromJSONL.jsx` | 按页面范围寻找文本框正上方同一列图片，为图片框命名 `Form 1`、`Form 2`，并从 JSONL 图片索引查找每张图出现的页码，写入 `Form N:\tpage1,page2`。 | 输入页码范围；选择或确认图片索引 JSONL。 |

### 第二章自动化子目录

`Graduation_Design_2026-05/Graduation_design_chapter_2_auto/` 是一套共享核心加多个入口的自动生成系统。真正逻辑集中在 `GraduationChapter2AutoCore.jsxinc`，入口 `.jsx` 只负责加载核心并调用对应模式。

| 文件 | 作用 |
| --- | --- |
| `main.jsx` | 总入口。运行前选中一个大 Group，要求直接子对象自上到下分别是事件 tags 模板、人物 people_tags 模板、天气 weather 模板。脚本会询问标签前缀、起始 JSON `id` 和生成范围，然后按跨页批次生成三类内容。 |
| `GenerateTagLabelsFromJSON.jsx` | 单独运行第二章事件 / `tags` 标签生成逻辑。 |
| `GeneratePeopleTagLabelsFromJSON.jsx` | 单独运行第二章人物 / `people_tags` 编号标签生成逻辑。 |
| `GenerateWeatherTextFramesFromJSON.jsx` | 单独运行第二章天气 / `weather` 文本框生成逻辑。 |
| `GraduationChapter2AutoCore.jsxinc` | 共享实现。集中配置 JSON 文件名、色表、生成间距、每页条目数、起始 id、批次页步进、三类模板识别、人物索引映射、天气格式化、清理旧生成对象等逻辑。修改第二章自动化行为时，通常应该改这个文件。 |

核心默认会在子目录或项目根目录查找：

- `diary_entries.merged.json`
- `diary_people_index.json`

当前核心配置中 `showStartAlert` 为 `true`，运行时会先弹出启动确认；`clearPreviousGenerated` 为 `false`，默认不会删除旧的生成对象。

### 数据文件

| 文件 | 说明 |
| --- | --- |
| `Graduation_Design_2026-05/selected_indd_files_image_file_index.jsonl` | 由 `ExportBookImageFileIndexToJSONL.jsx` 生成的图片索引。每行是一个图片文件记录，包含 `imageKey`、`linkName`、`linkPath`、`fileBaseName`、`occurrenceCount` 和 `pages`。 |
| `Graduation_Design_2026-05/selected_indd_files_image_file_index_summary.json` | 上面 JSONL 的摘要文件。当前摘要记录了 4 个源 InDesign 文件、418 页、2700 次图片放置、2657 个唯一链接图片文件和 2 个嵌入图像。 |

## 常见工作流

### 批量置图

1. 如果只是给当前选中的空框置图，用 `PlaceImagesIntoSelectedEmptyFrames.jsx`。
2. 如果要从某页开始跨页连续置图，并且页面空框已经按名称编号，用 `PlaceImagesAcrossPagesIntoNamedEmptyFrames.jsx`。
3. 如果要让脚本扫描整个文档空框并选择起点，用 `BatchPlaceImages.jsx`。
4. 如果图片文件名按日期命名，并且需要月份分隔条，用 `Graduation_Design_2026-05/BatchPlaceImagesByMonth.jsx`。

### 图片链接维护

1. 已选中图片框，想用另一个文件夹里的同名新图替换，用 `ReplaceSelectedImagesFromFolder.jsx`。
2. 文档里有缺失链接，想从一个文件夹里找回同名文件，用 `ReplaceMissingImagesFromFolder.jsx`。
3. 想统计一批 `.indd` 里每张链接图片出现在哪些页，用 `ExportBookImageFileIndexToJSONL.jsx`。
4. 想把统计结果写回版面上的 Form 索引文本框，用 `Graduation_Design_2026-05/AutoBuildImageIndexFromJSONL.jsx`。

### 日记 JSON 自动填充

1. 给标签模板生成事件标签，用 `Graduation_Design_2026-05/GenerateTagLabelsFromJSON.jsx`。
2. 给人物标签模板生成人物编号，用 `Graduation_Design_2026-05/GeneratePeopleTagLabelsFromJSON.jsx`。
3. 给天气模板生成天气文本，用 `Graduation_Design_2026-05/GenerateWeatherTextFramesFromJSON.jsx`。
4. 想按顶部图片文件名自动填日记日期、地点和时间段，用 `Graduation_Design_2026-05/AutoFillDiaryMetaFromTopImage.jsx`。
5. 第二章三类内容一起生成，用 `Graduation_Design_2026-05/Graduation_design_chapter_2_auto/main.jsx`。

## 维护建议

- 新增 JSX 时优先使用本目录常见入口结构：`function main() { ... }` 加外层 `try/catch`，错误弹窗里带 `err.message` 和 `err.line`。
- 大范围写入、删除、置入要先给用户确认，并用 `UndoModes.ENTIRE_SCRIPT` 包装。
- 整文档扫描文本框时，优先使用 InDesign 原生集合如 `doc.textFrames.everyItem().getElements()`，避免无差别递归 `allPageItems` 导致卡顿。
- 需要按页码匹配时，优先使用 `page.name`，这样能兼容章节页码、非从 1 开始的页码和书籍项目里的可见页码。
- JSX 语法只能做静态检查，不能替代 InDesign 现场运行。可用下面命令快速发现明显语法问题：

```bash
node --check --input-type=commonjs < SomeScript.jsx
```
