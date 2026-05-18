/*
  GenerateChapter2AllFromSelectedGroup.jsx

  用法：
  1. 打开 InDesign 文档。
  2. 选中一个大 Group。
  3. 大 Group 内部自上到下放三个直接子对象：
     - 第 1 个：事件 / tags 模板
     - 第 2 个：人物或任务 / people_tags 模板
     - 第 3 个：天气 / weather 文本框模板
  4. 运行本脚本。

  本脚本会只询问一次生成标签前缀和开始 JSON id，
  然后在同一个 UndoModes.ENTIRE_SCRIPT 操作里依次调用三个子逻辑。
*/

(function () {
    $.evalFile(new File(new File($.fileName).parent.fsName + "/GraduationChapter2AutoCore.jsxinc"));
    GraduationChapter2Auto.runAll();
})();
