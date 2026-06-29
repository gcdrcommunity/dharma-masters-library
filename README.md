# Dharma Masters Library
## 祖師教言文庫

這是一個可直接部署到 GitHub Pages 的靜態網站。

本版已把原本全部塞在 `index.html` 的正文內容拆出來，改成：

```txt
index.html                  # 網站入口，只保留頁面結構
assets/css/style.css         # 版面樣式
assets/js/app.js             # 讀取目錄與正文的程式
data/catalog.json            # 祖師、文集、章節目錄
data/footnotes.json          # 註解資料
content/                     # 每一篇教導正文，獨立 Markdown 檔
```

## 如何維護正文

每一篇教導都在 `content/` 裡。

例如《解脫莊嚴寶》在：

```txt
content/jewel-ornament-of-liberation/
```

要改某一章，只要修改對應的 `.md` 檔，不需要再打開巨大 `index.html`。

## 如何新增章節

1. 在對應的 `content/<work>/` 底下新增 `.md` 檔。
2. 打開 `data/catalog.json`。
3. 在該作品的 `chapters` 陣列中新增：

```json
{
  "title": "章節標題",
  "path": "content/作品資料夾/檔名.md"
}
```

## 《解脫莊嚴寶》章節確認

本版《解脫莊嚴寶》共 21 章，已包含：

- 第三章〈明善知識〉
- 第四章〈成佛之方法〉

## 本機預覽

因為網站使用 `fetch()` 讀取外部 Markdown 與 JSON，請用本機伺服器預覽，不要直接雙擊 `index.html`。

```bash
python3 -m http.server 8000
```

然後打開：

```txt
http://localhost:8000
```

## GitHub Pages 部署

1. 把本資料夾全部上傳到 GitHub repo。
2. 到 repo 的 `Settings` → `Pages`。
3. Source 選 `Deploy from a branch`。
4. Branch 選 `main`，Folder 選 `/ root`。
5. 儲存後等待 GitHub Pages 發布。
