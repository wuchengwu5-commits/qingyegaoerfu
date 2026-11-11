# 界面背景素材

更新：2026-11-02

- 当前素材：春 · 山湖新绿，使用内置 ImageGen 生成，由用户从四季方案中选择第一张。
- 本地文件：`miniprogram/assets/spring-lake.webp`。
- 原图：`../outputs/golf-four-seasons-2026-11-02/01-春-山湖新绿.png`，941 × 1672 像素，完整保留。
- 应用版本：720 × 1279 像素 WebP，质量参数 64，126,862 字节；仅调整编码与尺寸，画面内容未改变。
- 用途：首页、知识阅读封面、球场详情和关于页面的完整风景；功能页、知识页和球道图页面外层的统一氛围背景。实际球道图数据及卫星底图独立展示。
- 首页以 aspectFill 显示，左上叠加浅色局部渐变，保证品牌和标题可读；功能页使用浅绿衬底和轻微模糊。
- 该图片为 AI 意境，不是任何具体球场的实拍，不作为球场实景或球道数据使用。
- 生成提示词及四季原图：`../outputs/golf-four-seasons-2026-11-02/生成说明.md`。
- 上一版背景和界面文件备份：`../outputs/spring-ui-2026-11-02/before/`。

上一版首页摄影素材由 Calvin Seng 拍摄，来源为 https://www.pexels.com/photo/lush-green-golf-course-landscape-under-clear-sky-32401757/ ，使用条款为 https://www.pexels.com/license/ 。旧版候选素材的来源继续保留在 `preview/home-materials/index.html`。


## 2026-11-04 参考图校准

首页改用项目中依据四屏参考生成的晨光湖畔 AI 资产，源文件为 /Users/wuchengwu/.codex/generated_images/01a14eda-038b-7250-bc02-969664d3d06f/exec-87736b16-6450-43c7-8125-3dd7b21e48dc.png，应用资源为 miniprogram/assets/morning-lake.webp（720 像素宽）。功能页采用同批生成的充分虚化风景，源文件 exec-4c77804c-be30-4739-96eb-87af6d316597.png，应用资源 morning-mist.webp（480 像素宽）。仅转码缩放，首页以 CSS 降低饱和度。以上为 AI 意境，不代表具体球场实拍。原春日素材与云资源保留。


## 2026-11-04 真机兼容修正

首页及功能页关键背景改为本地 morning-lake.jpg / morning-mist.jpg，Logo 改为 wordmark.png。固定品牌标题使用 home-heading.png（1400×172 透明 PNG，内置 ImageGen 生成，已逐字核对“走进绿意，把心放慢。”），不依赖设备是否安装宋体。旧 WebP 暂留供历史版本比对，不再作为首页或功能页背景入口。


## 2026-11-04 上传工程整理

当前首页标题使用文案轮换功能（content/slogans.csv → services/slogans-data.js），保留最新文案配置。原固定标题 PNG 及三张已无引用的旧 WebP 移至 outputs/upload-ready-20261104/unused-assets 归档，不再进入上传工程。背景使用本地 morning-lake.jpg / morning-mist.jpg，品牌使用 wordmark.png。


## 2026-11-04 资源体积修正

按开发者工具“图片和音频资源不超过 200 K”要求优化：首页 JPG 保留 720×1556 尺寸，重新编码压缩；功能页虚化 JPG 保留 480×1038 尺寸；分享背景缩为 480×720；Logo 和按钮 PNG 优化调色板并保留透明通道。8 个球场分包的控制图标统一引用主包 assets/map-icons，删除重复与无引用图标，原素材已备份。全部包内图片音频合计 190727 字节，自动校验恢复为小于 200000 字节，不再使用 512 KiB 放宽值。


## 2026-11-05 天气图标

首页天气与风力图标采用 [Phosphor Icons regular](https://github.com/phosphor-icons/core)（MIT）。10枚图标按原始矢量路径转为48×48透明PNG，统一为橄榄绿，合计5062字节；源SVG与转码记录在 `../outputs/home-weather-2026-11-04/`，许可随 `miniprogram/assets/weather/LICENSE` 打包。
