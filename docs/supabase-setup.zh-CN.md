# Supabase 接入状态

项目：Baliza（`qkdegdyoupforiuolnon`，欧洲 eu-west-1）。

## 已配置

- `public.v16_events`：按来源和事件 ID 去重，保存开始时间和发现时间；历史事件不保存完整 XML 或位置。
- `public.v16_live_snapshot`：仅保留最新一次地图坐标快照，成功采集时覆盖。
- `public.v16_collection_runs`：采集状态，日志保留 14 天。
- `public.v16_hourly_counts(date)`：按 Europe/Madrid 日期统计，支持夏令时切换。
- `baliza_private.collect_v16()`：数据库通过 HTTP 扩展直接获取 DGT v3.7 XML。只接受来源 DGT3.0、引用以 V16_ 开头且有效的事件；识别规则来自当前数据样本。
- Cron 作业 `balizas-v16-collect-every-minute`：每分钟采集；事务锁避免并发，失败退避，尊重 Retry-After，网络超时 12 秒。
- Edge Function `v16-stats`：返回指定日期汇总或最新地图快照，开启 JWT 校验。使用服务端内置凭据读取数据，Vercel 后端仅使用公开 anon key。
- `stats.html`：从地图入口打开，显示真实云端统计，每分钟刷新。

本地预览：`npm run dev`，打开 http://127.0.0.1:5173/stats.html 。该开发服务器同时提供静态页面、地图和统计 API。

## 运维

停止采集：在 SQL Editor 执行 `select cron.unschedule('balizas-v16-collect-every-minute');`。

查看状态：

```sql
select requested_at, succeeded, event_count, error_code
from public.v16_collection_runs order by id desc limit 10;
select * from public.v16_hourly_counts((now() at time zone 'Europe/Madrid')::date);
select pg_size_pretty(pg_database_size(current_database()));
```

原始表启用 RLS，并撤销匿名角色权限。Advisor 的“启用 RLS 但无策略”信息是此服务端专用设计的预期结果；不要为了消除提示而开放匿名访问。

云端建表与采集已执行。网页通过 Vercel 的 `/api/dgt-feed` 和 `/api/dgt-stats` 读取云端数据，两者都使用 60 秒共享缓存。地图不再随着用户访问直接下载 DGT XML。统计在数据库中聚合，避免单次 REST 行数上限截断采集日志。

## 统计边界

采集于 2026-11-18 21:02（马德里时间）启动。首次采集可以记录仍活跃事件的较早开始时间，但不能补回启动前已结束的事件。表格是观测到的激活次数，不是官方完整全天总量或独立设备数量。

仅保存必要事件字段，不保存每分钟整份 XML。日志自动清理，历史事件不自动删除；请关注免费数据库空间并定期导出备份。

官方资料：

- https://supabase.com/kb/faqs/platform/database-only-cost
- https://supabase.com/docs/guides/cron/quickstart
- https://supabase.com/docs/guides/database/extensions/http
