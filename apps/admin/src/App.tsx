import { useState } from "react";
import {
  ConfigProvider,
  Layout,
  Menu,
  Card,
  Statistic,
  Row,
  Col,
  Empty,
  Input,
  Button,
  Form,
  Typography,
} from "antd";
import {
  DashboardOutlined,
  TeamOutlined,
  EyeOutlined,
  BarChartOutlined,
  SettingOutlined,
  NotificationOutlined,
  AuditOutlined,
} from "@ant-design/icons";
import zhCN from "antd/locale/zh_CN";

const { Sider, Header, Content } = Layout;

type PageKey =
  | "dashboard"
  | "users"
  | "rooms"
  | "stats"
  | "config"
  | "announce"
  | "audit";

const MENU: Array<{ key: PageKey; icon: React.ReactNode; label: string }> = [
  { key: "dashboard", icon: <DashboardOutlined />, label: "仪表盘" },
  { key: "users", icon: <TeamOutlined />, label: "用户管理" },
  { key: "rooms", icon: <EyeOutlined />, label: "房间/对局监控" },
  { key: "stats", icon: <BarChartOutlined />, label: "数据统计" },
  { key: "config", icon: <SettingOutlined />, label: "参数配置" },
  { key: "announce", icon: <NotificationOutlined />, label: "公告推送" },
  { key: "audit", icon: <AuditOutlined />, label: "审计日志" },
];

function LoginCard({ onLogin }: { onLogin: () => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", paddingTop: 120 }}>
      <Card title="🏮 酒馆后台登录" style={{ width: 360 }}>
        <Form layout="vertical" onFinish={onLogin}>
          <Form.Item label="管理员账号" name="username" rules={[{ required: true }]}>
            <Input placeholder="admin" />
          </Form.Item>
          <Form.Item label="密码" name="password" rules={[{ required: true }]}>
            <Input.Password placeholder="••••••" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            登录
          </Button>
        </Form>
        <Typography.Paragraph type="secondary" style={{ marginTop: 12, fontSize: 12 }}>
          骨架版演示登录；后端管理接口随开发阶段接入。
        </Typography.Paragraph>
      </Card>
    </div>
  );
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [page, setPage] = useState<PageKey>("dashboard");

  if (!loggedIn) return <LoginCard onLogin={() => setLoggedIn(true)} />;

  return (
    <ConfigProvider locale={zhCN}>
      <Layout style={{ minHeight: "100vh" }}>
        <Sider theme="dark" width={200}>
          <div
            style={{
              color: "#ffd166",
              fontWeight: 700,
              padding: "18px 16px",
              fontSize: 15,
            }}
          >
            🍶 酒馆后台
          </div>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[page]}
            items={MENU.map((m) => ({ key: m.key, icon: m.icon, label: m.label }))}
            onClick={(e) => setPage(e.key as PageKey)}
          />
        </Sider>
        <Layout>
          <Header
            style={{
              background: "#fff",
              paddingInline: 24,
              fontWeight: 600,
              borderBottom: "1px solid #f0f0f0",
            }}
          >
            {MENU.find((m) => m.key === page)?.label}
          </Header>
          <Content style={{ padding: 24 }}>
            {page === "dashboard" && (
              <Row gutter={16}>
                <Col span={6}>
                  <Card>
                    <Statistic title="今日在线峰值" value={0} suffix="人" />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card>
                    <Statistic title="今日活跃玩家" value={0} />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card>
                    <Statistic title="今日对局数" value={0} />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card>
                    <Statistic title="今日交易额(灵石)" value={0} />
                  </Card>
                </Col>
              </Row>
            )}
            {page !== "dashboard" && (
              <Card>
                <Empty description="该模块随开发阶段逐步接入（用户管理 / 房间监控 / 统计 / 配置 / 公告 / 审计）" />
              </Card>
            )}
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}
