/*
  文件: GeneratePeopleTagLabelsFromJSON.jsx

  用途:
  - 单独运行毕业设计第二章的人物 / people_tags 编号标签生成逻辑。
  - 实际逻辑来自同目录 GraduationChapter2AutoCore.jsxinc。

  使用前:
  - 打开毕业设计第二章 InDesign 文档。
  - 选中人物标签模板，或按共享核心要求准备模板选区。
  - 确认项目目录中存在 diary_entries.merged.json 和 diary_people_index.json。

  运行流程:
  1. 运行脚本。
  2. 脚本加载 GraduationChapter2AutoCore.jsxinc。
  3. 按提示输入标签前缀、起始 JSON id 和生成范围。

  注意:
  - 修改生成规则时请改 GraduationChapter2AutoCore.jsxinc，而不是只改这个入口文件。
*/
(function () {
    $.evalFile(new File(new File($.fileName).parent.fsName + "/GraduationChapter2AutoCore.jsxinc"));
    GraduationChapter2Auto.runStandalone("people");
})();
