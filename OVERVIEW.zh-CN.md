TokenFlux 用量把 TokenFlux 的额度放进 Paseo 的用量页。它显示订阅的月度套餐用量，套餐设置了日或周限额时也显示这两项；还有剩余的套餐 Credits、API Key 的 5 小时、1 天、7 天滚动限额、Key 的总额度或钱包余额，以及今天的请求数、Token 数和费用。每一行有限额百分比，TokenFlux 提供重置时间时也会显示。

插件用你自己的 API Key 从 TokenFlux 的用量接口读取账号信息。卡片由 Paseo 绘制，并和其他用量来源一起刷新。

## 设置

需要 Paseo 0.11.0 或更高版本。插件按下面两种来源找 API Key，先找到的先用。

1. Paseo 主目录下 `tokenflux-usage.json` 里的取密钥命令。Paseo 不经过 shell 直接执行它，从输出里读密钥。用 1Password 时可以写成 `["op", "read", "op://Private/TokenFlux/credential"]`。
2. Paseo 守护进程的环境变量 `TOKENFLUX_API_KEY`。

两种都没有时不显示卡片。密钥必须属于你想查看用量的那个 TokenFlux 账号。

`tokenflux-usage.json` 可以不建，里面只有一个字段 `keyCommand`，就是上面的命令数组。改完文件后重新加载插件。

## 数据与限制

密钥只会在每次刷新时作为 bearer token 发往 `https://tokenflux.dev/v1/usage`。插件不保存任何东西，也没有自己的界面，卡片由 Paseo 绘制。取密钥命令以守护进程的权限运行，和所有插件的服务端代码一样。

卡片显示所配置 Key 的全局用量。agent 会话不提供登录信息，所以每个 agent 的上下文环里没有 TokenFlux 额度。订阅限额和用量来自同一个接口，单位按 TokenFlux 返回的值显示（多数账号是 Credits）。今天的请求数、Token 数和费用在同一行文字里显示。

本插件是独立项目，与 TokenFlux 没有关联。
