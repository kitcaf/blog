import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
const markdownText = `
# 欢迎来到 Unified 的世界

这是一个**极简**的测试案例。

- 第一步：解析 (Parse)
- 第二步：转换 (Transform)
- 第三步：生成 (Stringify)
`;
async function main() {
    console.log('--- 正在启动 unified 加工流水线 ---\n');
    const file = await unified()
        .use(remarkParse) //解析 - 生成mdast AST
        .use(remarkRehype) // 转换 - mdast AST 转换为hast AST
        .use(rehypeStringify) // 把 hast 序列化成 HTML 字符串
        .process(markdownText)
    console.log(String(file))
}
function rehypeCodeHighlight() {

}

main()

