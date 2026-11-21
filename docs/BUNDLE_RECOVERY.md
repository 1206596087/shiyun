# 知识库导出与离线恢复

桌面应用 → 设置与回收站 → 导出完整知识库。选择数据目录以外的位置，完成后保存 .shiyunbundle 文件。数据库备份按钮只备份数据库，不能替代完整导出。

当前包格式为自定义流式容器，不是 ZIP。开头为 SHIYUNBUNDLE1 换行、UTF-8 JSON 字节数换行、JSON manifest，随后按 manifest.files 顺序连续存储文件字节。manifest 包含 version、createdAt 和每个文件的 path/size/sha256。无压缩、无加密。包含数据库中所有书目、笔记、划线、关系、布局、设置及管理的源文件。

## 在新的目录还原

关闭诗云；安装 Node.js 22.13 或以上（本轮在 Node 26.5 验证），从项目根目录执行：

```sh
node scripts/restore-bundle.mjs "/path/backup.shiyunbundle" "/path/new-library"
```

目标目录必须尚不存在；脚本拒绝覆盖，包括已有空目录。最多接受 100 GiB/10 万文件；有哈希、长度、路径或数据库完整性错误时清理本次临时目录，原有书库不变。需要足够磁盘空间容纳包和还原目录。

测试新目录可设置 SHIYUN_DATA_DIR 为该目录再运行桌面应用；不要同时启动两个实例访问同一书库。Windows PowerShell 示例：

```powershell
$env:SHIYUN_DATA_DIR = "D:\ShiyunRecovered"
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npm run dev
```

不设置变量时仍使用原默认位置：Windows 的 %APPDATA%\shiyun，Mac 的 Application Support/shiyun。切换到新目录不会合并或删除旧书库，旧目录应完整保留。正式使用前核对书籍能打开、划线可定位、笔记正文和关联完整。跨 Windows 机器的实测待完成。

不支持包合并、冲突消解、导入界面。它们属于 0.7.0，不应通过覆盖正在使用的数据库代替。
