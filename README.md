# 青野高尔夫

高尔夫记分、球场目录、球道地图与多人球局微信小程序。此仓库收录截至 2026-11-14 的本地代码；主要维护入口为 `qingye-miniprogram/`。

本次同步包含统一的球局创建流程、一级记分入口与恢复、小组球员管理、成绩分享、反馈管理及现有地图与云服务代码。GitHub 同步不等于微信体验版更新、云函数部署或正式发布。

## 目录

| 路径 | 内容 |
| --- | --- |
| `qingye-miniprogram/` | 当前微信原生小程序、云函数、管理后台、云图片原件与测试 |
| `demos/` | 独立交互演示源码与成品 |
| `course-art-library/` | 图库管理工具源码，不含本机图库历史数据库 |
| `templates/map-ui/` | 当前 GPS 地图显示模板 |
| `templates/course-map/` | 球场地图分包共用的页面模板 |
| `tools/` | 目录打包、地图模板生成及历史资料处理工具 |
| `shared-golf/` | 公共球场目录、记分与规则逻辑 |
| `golf-h5/` | H5 版本及本地资料管理服务 |
| `golf-score/` | 早期小程序实现与预览 |
| `tests/` | 跨模块记分、目录和后台测试 |
| `outputs/` | 现有构建或回归测试引用的少量固定资料；不含运行日志、账户数据库或个人球局备份 |

## 打开微信小程序

1. 在微信开发者工具中导入 `qingye-miniprogram/`，不要导入仓库根目录。
2. 项目配置已包含当前 AppID；开发、预览与上传需要对应小程序的开发权限。
3. 云函数与资源配置见 [云开发说明](qingye-miniprogram/CLOUD_SETUP.md)。当前客户端配置位于 `qingye-miniprogram/miniprogram/config.js`；AppID、环境 ID 和资源路径不是登录凭据。
4. 云函数位于 `qingye-miniprogram/cloudfunctions/qingye/`，通过开发者工具上传并部署，选择云端安装依赖。仓库不包含 AppSecret 或管理员密码。
5. 图片原件位于 `qingye-miniprogram/cloud-assets/media-v1/`，对应清单和校验值见该目录上一级的 `manifest.json`。使用其他云环境时需上传图片并调整配置。

## 定位现状

本次上传保留现有实现：附近球场及球道图使用 `wx.getLocation`；球道图在前台定时重新定位，离开页面会停止定时请求。尚未接入 `wx.startLocationUpdate` / `wx.onLocationChange`。微信接口权限与隐私指引需在小程序后台配置，GitHub 上传不会开通权限，也不会发布微信版本。

球道距离为地图水平估算，地图完善程度以页面提示为准。历史说明文件中的版本记录仅代表对应日期；以当前代码与实际验收结果为准。

## 常用维护与检查

需要 Node.js 22 或更新版本，以及 Python 3。以下命令在仓库根目录运行：

```sh
# 更新各球场分包的公共页面
python3 tools/course-maps/build-template.py

# 由可编辑球场目录生成小程序压缩目录
node tools/pack-native-catalog.cjs

# 当前小程序与相关版本的已有测试
node --test qingye-miniprogram/tests/*.test.cjs qingye-miniprogram/tests/*.test.js golf-h5/tests/*.test.cjs golf-score/tests/*.test.js tests/*.test.cjs
python3 -m unittest discover -s qingye-miniprogram/tests -p '*_test.py'
python3 -m unittest discover -s tests -p '*_test.py'
```

浏览器预览可运行 `python3 qingye-miniprogram/build-preview.py`，再从 `qingye-miniprogram/` 启动 `python3 -m http.server 8768`，访问 `http://127.0.0.1:8768/preview/`。浏览器仅用于布局参考，不能替代微信真机授权、定位与多人同步验收。

`tools/` 中部分历史地图采集、渲染脚本引用未收录的研究原图或本机依赖路径，使用前需按所在环境配置；已生成的小程序代码和运行用图片随仓库提供。

## 文件与素材

本机数据库、个人备份、开发工具私有配置、临时日志和依赖安装目录未纳入仓库。球场资料与图片保留原有来源说明，参见 [素材说明](qingye-miniprogram/ASSET-SOURCES.md)、地图配置和图片目录中的 README；公开仓库不改变第三方素材原有权利。
