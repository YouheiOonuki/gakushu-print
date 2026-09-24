# fonts

なぞり書きのマス目だけで使う、教科書体に近い手書き風フォント。端末に教科書体（UD デジタル 教科書体・游教科書体・Klee）があればそちらを使い、無いときだけ読み込む（yorozu-craft の README「ツールを追加するとき」9 の例外。2026-09-24 オーナー決定）。

| ファイル | 中身 | 大きさ |
|---|---|---|
| `klee-kana.woff2` | 英数字・記号・ひらがな・カタカナ | 約 33KB |
| `klee-kanji.woff2` | 小学校の学年別漢字配当表の 1,026 字（`constants.js` の字） | 約 270KB |

- 元: Klee One Regular（Fontworks）。https://github.com/google/fonts/tree/main/ofl/kleeone
- ライセンス: SIL Open Font License 1.1（`OFL.txt`）。このリポジトリの MIT とは別に、このフォルダのフォントには OFL が適用される
- 作り方（fonttools。レイアウト機能は落として小さくする）:

```bash
pyftsubset KleeOne-Regular.ttf --unicodes="U+20-7E,U+3001-3002,U+300C-300D,U+3005,U+3006,U+3041-3096,U+309D-309E,U+30A1-30FA,U+30FB-30FE,U+FF08-FF09,U+FF01,U+FF1F" --flavor=woff2 --layout-features='' --output-file=klee-kana.woff2
pyftsubset KleeOne-Regular.ttf --text-file=kanji.txt --flavor=woff2 --layout-features='' --output-file=klee-kanji.woff2   # kanji.txt は constants.js の漢字
```

漢字の一覧を変えたら `klee-kanji.woff2` も作り直す（`tests/font.test.js` が、一覧の字がすべてフォントにあるかを確かめる）。
