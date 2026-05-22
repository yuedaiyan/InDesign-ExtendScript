# InDesign Scripts Panel 脚本说明

这个目录保存的是 Adobe InDesign Scripts Panel 里直接运行的 ExtendScript / JSX 脚本。大多数脚本都需要先打开 InDesign 文档，并在运行前选中模板、文本框、图片框或页面对象。很多批处理脚本使用 `app.doScript(..., UndoModes.ENTIRE_SCRIPT, ...)` 包装执行，完成后通常可以用一次 `Cmd+Z` 撤销本次全部操作。

## 根目录脚本

### `AutoFillNumbers.jsx`

把当前选中的文本框填成从 `1` 到用户输入数字的连续编号，每个数字一行。脚本会自动处理“选中文本内容而不是文本框本体”的情况，最终写入同一个文本框。

### `BatchPlaceImages.jsx`

批量把图片文件夹里的图片按文件名顺序置入文档中的空白图片框。运行后会弹出设置窗口，可以选择从当前选中的图片框开始、从指定页码第一个空框开始，或从文档第一个空框开始；同时可以选择“按比例填充”或“按比例适合”。脚本会扫描所有页面里的空 Rectangle / Oval / Polygon，按页、行、列排序后依次置入图片。

### `BatchPlaceImagesByMonth.jsx`

按月份分组批量置入图片。图片文件名必须符合 `YYYY-MM-DD[_N].ext` 这类日期命名规则。运行前需要同时选中一个分隔条模板 Group 和一个起始空图片框。脚本会按月份插入分隔条，月份切换时补齐当前行，空月份也会生成分隔条并空出一整行图片槽位。适合做按月排列的图片墙或日记图片版面。

### `CopySelectionToPagesKeepLayers.jsx`

把当前跨页上选中的页面对象复制到指定目标页面范围所在的跨页，并尽量保持相对跨页的位置和原图层。脚本要求所有选中对象来自同一个跨页，目标页码使用 InDesign 中显示的实际页码输入。复制前会检查目标跨页、图层和对象可用性，复制后报告复制数量、跳过项和失败项。

### `FillPeopleIndexTableFromJSON.jsx`

读取同目录下的 `diary_people_index.json`，把人物索引写入当前选中的文本框。输出格式是每人一行：

```text
label<TAB>abbreviation<TAB>count
```

如果文本框属于串接 story，默认会替换整条 story，避免后续串接框残留旧内容。

### `FillTextFromImageNames.jsx`

把右侧图片组中各图片框的链接文件名写入左侧文本组中对应位置的文本框。运行前需要在跨页上同时选中两个 Group：一个纯文本框组、一个图片框组。脚本会询问页码范围，对范围内的偶数页文字组和奇数页图片组逐对处理；组内按从左到右、从上到下排序，空图片框对应的文本框保持不变。

### `GeneratePeopleTagLabelsFromJSON.jsx`

根据 `diary_entries.merged.json` 的 `people_tags` 字段生成人物编号标签。脚本还会读取 `diary_people_index.json`，把人名映射成人物索引里的 `label`。运行前选中一个人物标签模板 Group；脚本会询问生成对象标签和起始 JSON `id`，然后从该条 diary entry 开始生成最多 `MAX_ENTRIES` 条。每条 entry 的人物标签自下而上排列，不改变模板底色，并把同一 entry 的标签编成组。

### `GenerateTagLabelsFromJSON.jsx`

根据 `diary_entries.merged.json` 的 `tags` 字段生成事件/情绪标签。运行前选中一个标签模板 Group。脚本会询问生成对象标签和起始 JSON `id`，按 JSON 顺序生成标签：同一 entry 的 tags 自下而上排列，不同 entry 从左到右排列。脚本会按 `TAG_COLOR_MAP` 给标签文本框设置背景色，自动创建或复用 InDesign 色板；每条 entry 生成一个小组，所有 entry 组还可以整体向上对齐、再编成一个大组并移动到指定坐标。

### `GenerateWeatherTextFramesFromJSON.jsx`

根据 `diary_entries.merged.json` 的 `weather` 字段生成天气文本框。运行前可选中一个文本框模板，或选中包含文本框的 Group。每条 entry 生成一个复制对象，从左到右排列。`weather` 为空时生成空文本框；`weather` 是对象时会格式化成三行、列之间用 tab 对齐；`weather` 是字符串时会原样写入，以兼容旧 JSON。

### `InspectSelectedStructure.jsx`

检查当前选中对象或 Group 的结构，生成一份可读的树状报告。报告包含对象类型、名称、id、label、页面、图层、几何边界、文本摘要、图像链接信息和子对象结构。弹窗里提供复制到 macOS 剪贴板的功能，适合调试复杂 Group 或确认模板内部结构。

### `MoveContentAcrossFiles.jsx`

把一个 InDesign 文档中指定图层、指定页码范围内的页面对象复制到另一个已打开文档的指定图层和页码范围。脚本顶部有固定配置项，例如源/目标文档名、源/目标图层名、起始页和页数。它使用 `duplicate(targetPage)`，不是依赖剪贴板的复制粘贴，因此更适合跨文件批量迁移页面内容。

### `PlaceImagesAcrossPagesIntoNamedEmptyFrames.jsx`

跨页面把多选图片置入“按名称排序”的空图片框。运行前只需选中起始页面上的一个空图片框，然后多选图片文件。脚本会从起始页开始逐页收集空框，要求每页空框名称包含可排序的数字结构；图片按文件名自然排序后依次匹配空框。执行前会展示逐页置入计划和每个框对应的图片，确认后才真正置入。

### `PlaceImagesIntoSelectedEmptyFrames.jsx`

把图片文件夹中的图片置入当前选中的空图片框。脚本会先按阅读顺序排序所选空框，要求用户输入基础标签，然后把框架名称和脚本标签写成 `基础标签_1`、`基础标签_2` 等。可以指定从图片列表中的第几张开始置入，并选择填充或适合。图片不足时，剩余框只命名和打标签，不置入图片。

### `RemoveAllGrid.jsx`

删除当前活动文档中的所有参考线：

```javascript
app.activeDocument.guides.everyItem().remove();
```

这是一个极简清理脚本，没有弹窗确认。

### `SortSelectedItemsByReadingOrder.jsx`

把同一跨页、同一图层内选中的页面对象按阅读顺序排序，并依次重命名和写入脚本标签。支持文本框、图片框、空框架、线条和 Group 等常见 PageItem。用户输入一次基础文字后，脚本会生成 `基础文字_1`、`基础文字_2` 等名称和标签，并把阅读顺序第 1 个对象放到当前图层最前面。

### `TagSwatchUtils.jsx`

独立的色板创建工具。打开文档后运行，会根据脚本顶部的 `TEMPLATE_NAME` 创建一组 RGB Process 色板。当前内置模板包括 `tag_colors`、`sample_warm` 和 `sample_cool`。这个文件不被 `GenerateTagLabelsFromJSON.jsx` 引用，两者没有代码依赖。

### `fill_diary_info_from_json.jsx`

遍历当前 InDesign 文档所有页面和组内文本框，查找内容看起来像日期的文本框，例如 `2026-01-30` 或 `2026-01-30_2`。脚本读取固定路径 `/Users/yuedaiyan/code_school/biue_All/diary_entries.json`，按 `date` 匹配日记条目，再把文本框内容替换成模板：

```text
{date}
{location}
{time_of_day}
```

如果同一天有多条日记，没有显式 `_2` 这类编号时，会按文档中遇到该日期的顺序自动匹配第 1 条、第 2 条等。

## `Graduation_design_chapter_2_auto/` 子目录

这个子目录是一套“毕业设计第二章”自动生成脚本。三个单独入口和总入口都依赖同目录下的 `GraduationChapter2AutoCore.jsxinc`，核心逻辑不在 `.jsx` 入口文件里。

### `Graduation_design_chapter_2_auto/main.jsx`

总入口。运行前选中一个大 Group，要求这个 Group 的直接子对象自上到下分别是：

1. 事件 / `tags` 模板 Group
2. 人物或任务 / `people_tags` 模板 Group
3. 天气 / `weather` 文本框模板

脚本会询问生成标签前缀、起始 JSON `id` 和生成范围，然后按跨页批次同时生成事件标签、人物标签和天气文本框。每一跨页批次作为一个撤销步骤。

### `Graduation_design_chapter_2_auto/GenerateTagLabelsFromJSON.jsx`

单独运行毕业设计第二章里的事件 / `tags` 标签生成逻辑。它只是加载 `GraduationChapter2AutoCore.jsxinc`，然后调用 `GraduationChapter2Auto.runStandalone("tags")`。

### `Graduation_design_chapter_2_auto/GeneratePeopleTagLabelsFromJSON.jsx`

单独运行毕业设计第二章里的人物 / `people_tags` 编号标签生成逻辑。它加载共享核心后调用 `GraduationChapter2Auto.runStandalone("people")`，会读取 `diary_entries.merged.json` 和 `diary_people_index.json`。

### `Graduation_design_chapter_2_auto/GenerateWeatherTextFramesFromJSON.jsx`

单独运行毕业设计第二章里的天气 / `weather` 文本框生成逻辑。它加载共享核心后调用 `GraduationChapter2Auto.runStandalone("weather")`。

### `Graduation_design_chapter_2_auto/GraduationChapter2AutoCore.jsxinc`

虽然不是 `.jsx` 文件，但它是这个子目录所有入口真正依赖的共享实现。里面集中配置了 JSON 文件名、生成间距、每页条目数、色彩映射、起始 id、生成范围、三类模板识别、天气格式化、人物索引映射、跨页批量生成等逻辑。修改毕业设计第二章自动化行为时，通常应该改这个核心文件，而不是只改四个入口 `.jsx`。

