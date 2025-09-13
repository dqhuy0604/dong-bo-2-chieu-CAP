import { Controller, Get, Post, Body, Res } from '@nestjs/common';
import type { Response } from 'express';
import { WebDashboardService } from './web-dashboard.service';

@Controller()
export class WebDashboardController {
    constructor(private readonly webDashboardService: WebDashboardService) { }

    @Get()
    async getDashboard(@Res() res: Response) {
        const mongoUsers = await this.webDashboardService.getMongoUsers();
        const redisUsers = await this.webDashboardService.getRedisUsers();
        const metrics = await this.webDashboardService.getSyncMetrics() as any;

        const html = `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Redis-MongoDB Sync Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container { 
            max-width: 1400px; 
            margin: 0 auto; 
            background: white; 
            border-radius: 15px; 
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .header { 
            background: linear-gradient(135deg, #2c3e50, #34495e); 
            color: white; 
            padding: 30px; 
            text-align: center; 
        }
        .header h1 { font-size: 2.5em; margin-bottom: 10px; }
        .header p { font-size: 1.2em; opacity: 0.9; }
        
        .metrics { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
            gap: 20px; 
            padding: 30px; 
            background: #f8f9fa; 
        }
        .metric-card { 
            background: white; 
            padding: 25px; 
            border-radius: 10px; 
            text-align: center; 
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
            border-left: 5px solid #3498db;
        }
        .metric-value { 
            font-size: 2.5em; 
            font-weight: bold; 
            color: #2c3e50; 
            margin-bottom: 5px; 
        }
        .metric-label { 
            color: #7f8c8d; 
            font-size: 1.1em; 
        }
        
        .content { 
            display: grid; 
            grid-template-columns: 1fr 1fr; 
            gap: 30px; 
            padding: 30px; 
        }
        
        .section { 
            background: #f8f9fa; 
            border-radius: 10px; 
            padding: 25px; 
        }
        .section h2 { 
            color: #2c3e50; 
            margin-bottom: 20px; 
            font-size: 1.5em;
            border-bottom: 3px solid #3498db;
            padding-bottom: 10px;
        }
        
        .user-list { 
            max-height: 400px; 
            overflow-y: auto; 
        }
        .user-item { 
            background: white; 
            margin: 10px 0; 
            padding: 15px; 
            border-radius: 8px; 
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            border-left: 4px solid #e74c3c;
        }
        .user-item.redis { border-left-color: #e67e22; }
        .user-item.mongo { border-left-color: #27ae60; }
        
        .user-email { 
            font-weight: bold; 
            color: #2c3e50; 
            font-size: 1.1em; 
        }
        .user-name { 
            color: #7f8c8d; 
            margin: 5px 0; 
        }
        .user-meta { 
            font-size: 0.9em; 
            color: #95a5a6; 
        }
        
        .form-section { 
            background: #f8f9fa; 
            border-radius: 10px; 
            padding: 25px; 
            margin: 30px; 
        }
        .form-section h2 { 
            color: #2c3e50; 
            margin-bottom: 20px; 
            text-align: center;
        }
        
        .form-group { 
            margin-bottom: 20px; 
        }
        .form-group label { 
            display: block; 
            margin-bottom: 8px; 
            font-weight: bold; 
            color: #2c3e50; 
        }
        .form-group input { 
            width: 100%; 
            padding: 12px; 
            border: 2px solid #ddd; 
            border-radius: 8px; 
            font-size: 16px; 
            transition: border-color 0.3s;
        }
        .form-group input:focus { 
            outline: none; 
            border-color: #3498db; 
        }
        
        .button-group { 
            display: flex; 
            gap: 15px; 
            justify-content: center; 
        }
        .btn { 
            padding: 12px 30px; 
            border: none; 
            border-radius: 8px; 
            font-size: 16px; 
            font-weight: bold; 
            cursor: pointer; 
            transition: all 0.3s;
            min-width: 150px;
        }
        .btn-mongo { 
            background: #27ae60; 
            color: white; 
        }
        .btn-mongo:hover { 
            background: #229954; 
            transform: translateY(-2px);
        }
        .btn-redis { 
            background: #e67e22; 
            color: white; 
        }
        .btn-redis:hover { 
            background: #d35400; 
            transform: translateY(-2px);
        }
        .btn-refresh { 
            background: #3498db; 
            color: white; 
            margin: 20px auto;
            display: block;
        }
        .btn-refresh:hover { 
            background: #2980b9; 
            transform: translateY(-2px);
        }
        
        .status { 
            margin-top: 20px; 
            padding: 15px; 
            border-radius: 8px; 
            text-align: center; 
            font-weight: bold; 
        }
        .status.success { 
            background: #d4edda; 
            color: #155724; 
            border: 1px solid #c3e6cb; 
        }
        .status.error { 
            background: #f8d7da; 
            color: #721c24; 
            border: 1px solid #f5c6cb; 
        }
        
        .loading { 
            text-align: center; 
            color: #7f8c8d; 
            font-style: italic; 
        }
        
        @media (max-width: 768px) {
            .content { grid-template-columns: 1fr; }
            .metrics { grid-template-columns: repeat(2, 1fr); }
            .button-group { flex-direction: column; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔄 Redis-MongoDB Sync Dashboard</h1>
            <p>Đồng bộ dữ liệu hai chiều với NestJS Microservices</p>
        </div>
        
        <div class="metrics">
            <div class="metric-card">
                <div class="metric-value">${metrics.processed || 0}</div>
                <div class="metric-label">Sự kiện đã xử lý</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${metrics.conflicts || 0}</div>
                <div class="metric-label">Xung đột đã giải quyết</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${metrics.retries || 0}</div>
                <div class="metric-label">Lần thử lại</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${mongoUsers.length}</div>
                <div class="metric-label">Users trong MongoDB</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${redisUsers.length}</div>
                <div class="metric-label">Users trong Redis</div>
            </div>
        </div>
        
        <div class="form-section">
            <h2>🚀 Tạo User Mới</h2>
            <form id="userForm">
                <div class="form-group">
                    <label for="email">Email:</label>
                    <input type="email" id="email" name="email" required placeholder="user@example.com">
                </div>
                <div class="form-group">
                    <label for="name">Tên:</label>
                    <input type="text" id="name" name="name" required placeholder="Tên người dùng">
                </div>
                <div class="button-group">
                    <button type="button" class="btn btn-mongo" onclick="createUser('mongo')">
                        📊 Mongo-First
                    </button>
                    <button type="button" class="btn btn-redis" onclick="createUser('redis')">
                        ⚡ Redis-First
                    </button>
                </div>
            </form>
            <div id="status"></div>
        </div>
        
        <div class="content">
            <div class="section">
                <h2>📊 MongoDB Users</h2>
                <div class="user-list">
                    ${mongoUsers.map(user => `
                        <div class="user-item mongo">
                            <div class="user-email">${user.email}</div>
                            <div class="user-name">${user.name}</div>
                            <div class="user-meta">
                                Cập nhật: ${new Date(user.updatedAt).toLocaleString('vi-VN')} | 
                                Version: ${user.version} | 
                                Source: ${user.source}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <div class="section">
                <h2>⚡ Redis Users</h2>
                <div class="user-list">
                    ${redisUsers.map(user => `
                        <div class="user-item redis">
                            <div class="user-email">${user.email}</div>
                            <div class="user-name">${user.name}</div>
                            <div class="user-meta">
                                Cập nhật: ${new Date(user.updatedAt).toLocaleString('vi-VN')} | 
                                Version: ${user.version} | 
                                Source: ${user.source}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
        
        <div style="text-align: center; padding: 20px;">
            <button class="btn btn-refresh" onclick="location.reload()">
                🔄 Làm mới dữ liệu
            </button>
        </div>
    </div>
    
    <script>
        async function createUser(type) {
            const email = document.getElementById('email').value;
            const name = document.getElementById('name').value;
            const statusDiv = document.getElementById('status');
            
            if (!email || !name) {
                showStatus('Vui lòng nhập đầy đủ thông tin!', 'error');
                return;
            }
            
            showStatus('Đang tạo user...', 'loading');
            
            try {
                const endpoint = type === 'mongo' ? '/api/mongo-first' : '/api/redis-first';
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, name })
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    showStatus(\`✅ Tạo user thành công! (\${type === 'mongo' ? 'Mongo-First' : 'Redis-First'})\`, 'success');
                    setTimeout(() => location.reload(), 2000);
                } else {
                    showStatus(\`❌ Lỗi: \${result.message || 'Không thể tạo user'}\`, 'error');
                }
            } catch (error) {
                showStatus(\`❌ Lỗi kết nối: \${error.message}\`, 'error');
            }
        }
        
        function showStatus(message, type) {
            const statusDiv = document.getElementById('status');
            statusDiv.innerHTML = \`<div class="status \${type}">\${message}</div>\`;
        }
        
        // Auto refresh every 30 seconds
        setTimeout(() => location.reload(), 30000);
    </script>
</body>
</html>
    `;

        res.send(html);
    }

    @Post('api/mongo-first')
    async createUserMongoFirst(@Body() body: { email: string; name: string }) {
        try {
            return await this.webDashboardService.createUserMongoFirst(body);
        } catch (error) {
            return { error: error.message };
        }
    }

    @Post('api/redis-first')
    async createUserRedisFirst(@Body() body: { email: string; name: string }) {
        try {
            return await this.webDashboardService.createUserRedisFirst(body);
        } catch (error) {
            return { error: error.message };
        }
    }
}
