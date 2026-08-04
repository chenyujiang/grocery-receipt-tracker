Type: grilling
Status: resolved

## Question

数据导出/月度报告的具体格式与内容是什么？（核心数据模型已经在 01-09 号 ticket 里定完，现在可以把这个功能的细节定下来了。）
What exactly should data export / monthly reports look like? (The core data model is now fully defined across tickets 01-09, so this feature's details can now be pinned down.)

需要覆盖：
Needs to cover:

- 导出格式——CSV、Excel，还是生成一份可读的月度报告页面/PDF。
  Export format — CSV, Excel, or a readable monthly report page/PDF.
- 导出内容范围——原始逐条购买记录，还是汇总后的统计（按分类、按商品的月度总支出）。
  Export scope — raw line-by-line purchase records, or aggregated statistics (monthly totals by category, by product).
- 导出维度——按圈子整体导出，还是可以按个人（谁买的）筛选导出。
  Export dimension — export for the whole circle, or filterable by individual (who bought it).
- 月度报告是否是一个独立页面（类似 06 号 ticket 的涨幅对比页），还是导出文件本身就是"报告"。
  Whether the monthly report is a standalone page (similar to the price-comparison page from ticket 06), or the exported file itself serves as the "report."

## Answer

**导出格式**：CSV。不需要额外的 Excel 生成库，用户可以直接导入 Excel/Google Sheets 自己做二次分析。
**Export format**: CSV. No extra Excel-generation library needed; users can import it straight into Excel/Google Sheets for their own further analysis.

**导出内容**：逐条明细，每个 `ReceiptItem` 展开成一行，带上商品名、分类、数量、规格、单价、店铺、日期、上传人这些字段，不做预先汇总，让用户在 Excel 里自己怎么汇总都行。
**Export content**: line-by-line detail — each `ReceiptItem` expands into one row, with fields for product name, category, quantity, spec, unit price, store, date, and uploader; nothing is pre-aggregated, so users can summarize it however they like in Excel.

**导出范围**：默认导出整个圈子的数据，用户可以选时间范围（如最近一个月、自定义起止日期），不按上传人筛选，保持导出选项简单。
**Export scope**: exports the whole circle's data by default; the user can pick a time range (e.g. the last month, or a custom start/end date); no filtering by uploader, keeping the export options simple.

**月度报告页面**：需要一个独立页面，把已有的几项计算汇总成一个"月度总结"视图（按月份选择，可切换查看历史月份）：
**Monthly report page**: a standalone page is needed, pulling several already-defined calculations into one "monthly summary" view (selectable by month, with the ability to browse past months):

- 本月总支出，以及和上月的环比变化。
  This month's total spend, and the month-over-month change versus last month.
- 按分类的支出占比（04 号 ticket 的分类目录）。
  Spending breakdown by category (using the category taxonomy from ticket 04).
- 涨幅榜单——直接复用 06 号 ticket 已经定的计算逻辑，作为报告里的一个板块嵌入展示，而不是另外做一个重复的独立页面；14 号 ticket 里原本单列的"涨幅统计" tab 改成指向这个月度报告页。
  Price-change leaderboard — this reuses the calculation logic already defined in ticket 06, embedded as a section within the report rather than existing as a separate, duplicate page; the standalone "Price Stats" tab from ticket 14 now points to this monthly report page instead.
- 本月触发过的价格异常和低库存提醒次数（10/11 号 ticket 的数据）。
  The number of price-spike and low-stock alerts triggered this month (data from tickets 10/11).
- 按上传人（`uploaded_by`）统计的支出分布，以及本月一共上传了多少张小票、多少个商品条目。
  Spending distribution by uploader (`uploaded_by`), plus the total number of receipts and line items uploaded this month.

**导出入口**：放在这个月度报告页面上，作为一个"导出当前时间范围数据"的按钮，不单独开一个导出专属页面。
**Export entry point**: placed on this monthly report page as an "export data for the current time range" button, rather than opening a separate dedicated export page.
