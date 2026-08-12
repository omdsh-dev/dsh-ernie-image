# dsh-ernie-image

DSH 百度 ERNIE-Image-Turbo 文生图插件：宿主端注册图像生成工具（图片落盘 + 注册为会话附件，agent 可继续读图），浏览器端提供插件配置卡（密钥用户自填、测试连接、默认参数）与「✨ 文生图」生成画廊面板（prompt → 变体 → 预览/下载/同 seed 复现/换 seed 出变体 → 插入会话）。

## 定位

- 数据源：[百度 AI Studio](https://aistudio.baidu.com/) 的 `ERNIE-Image-Turbo` 文生图模型（`/llm/lmapi/v3/images/generations`）。
- 宿主工具：
  - `ernie_generate_image(prompt, {size, n, seed, usePe, steps, guidance})` → 生成 PNG 落盘到
    `$DSH_HOME/ernie-image/<YYYY-MM-DD>/` 并注册为会话附件，返回附件引用 + 磁盘路径；同 seed 同参数可复现同一张图。
  - `ernie_image_test()` → 最小请求（n=1、小 prompt）探测密钥与网络；未配置密钥时返回指向设置卡的引导。
- 浏览器 UI：
  - 设置 → 插件配置 → **ERNIE 文生图** 卡片：密钥（走 DSH 凭据保险箱，值永不回传浏览器）、测试连接、
    生成默认参数（size / use_pe / steps / guidance）、面板开关。
  - 右下角 **✨ 文生图** 面板：prompt + 7 档尺寸预设 chips + 张数/seed/步数/引导 → 生成骨架屏 →
    画廊（大图预览 / 下载 / 同 seed 重生成 / 换 seed 出变体 / 插入会话，插入会话直接把图作为消息附件发给 agent）。

## 密钥获取与配置

1. 打开 [aistudio.baidu.com](https://aistudio.baidu.com/) 并登录百度账号；
2. 右上角头像 → **访问令牌** → 新建，复制令牌；
3. 在 DSH 设置 → 插件配置 → **ERNIE 文生图** 卡片粘贴并保存（或设置环境变量
   `ERNIE_IMAGE_API_KEY`，环境变量优先且只读遮蔽）。

> 与 OCR 插件（paddle-ocr）使用的是**同一个 aistudio token**，可以填同一个。

> ⚠️ **安全提醒：请勿复用旧 token。** 本插件的前身 skill（`kk_skill/skills/ernie-image/generate.py`）
> 曾把 AI Studio 访问令牌硬编码进脚本并进入 git 历史，该 token 视为已泄漏：请到 AI Studio
> 令牌页**轮换（删除重建）**，不要把旧 token 填入本插件。本插件自身不含任何密钥，凭据只写入
> DSH 凭据保险箱（`$DSH_HOME/.credentials.yaml`），不进入设置文档、日志或会话内容。

## 安装

```yaml
# 宿主组合（profile cordis.patch.yml / bundle patch）插入一行：
- insert:
    - id: ernie-image
      name: dsh-ernie-image
```

浏览器半区通过包内 `dsh.client` 清单自动发现（`exports["./client"]`），无需额外配置。
宿主行挂载后客户端 bundle 以 `/plugins/dsh-ernie-image/client.js` 提供服务。

> 说明：配置卡的默认参数读写走插件自带的 `/ernie-image` loopback RPC 通道，而不是
> `settingsScope`——DSH 的 settings 线上域按 api-proxy 允许名单暴露命名空间，自包含插件
> 用自己的 RPC 即可在热重载下立刻可用，无需改动部署源码。

## 参数速查（ERNIE-Image-Turbo）

| 参数 | 范围/取值 | 默认 |
|---|---|---|
| size | 1024x1024 / 1376x768 / 1264x848 / 1200x896 / 896x1200 / 848x1264 / 768x1376 | 1024x1024 |
| n | 1-4 | 1 |
| seed | 正整数；同 seed 同参数可复现 | 随机 |
| use_pe | prompt 增强 | 开（默认参数可改） |
| num_inference_steps | 4-20 | 8 |
| guidance_scale | 1.0-7.5 | 1.0 |

## 开发与构建

```bash
npm install --no-audit --no-fund                       # 公开 devDependencies
DSH_WORKSPACE_ROOT=/path/to/dsh-checkout npm run setup:dsh-workspace   # 链接 DSH 私有 peer
npm run typecheck && npm run build                     # 门禁：tsc（host 半区）+ tsdown（client bundle）
```

`lib/` 为构建产物：host 半区 tsc 输出 + client 半区 tsdown bundle（CSS 内联、平台模块 external）。
宿主行修改后需要重启 DSH 进程生效（Node ESM 模块缓存）；客户端 bundle 改动重建后刷新浏览器即可。

## 美术素材

`assets/` 内的 SVG（插件图标、设置卡配图、生成骨架屏插画、7 个尺寸比例线框）为扁平线性插画风格
（中性灰描边 + 紫罗兰强调色，透明背景，适配深/浅色主题）。原计划由 Codex 生成，因 Codex 账号
用量上限（预计 Aug 18 重置）改为手工绘制，风格规范保持一致。

## License

BSD-3-Clause
