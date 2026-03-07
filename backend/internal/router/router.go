package router

import (
	"blog-backend/internal/config"
	"blog-backend/internal/handlers"
	"blog-backend/internal/middleware"
	"blog-backend/internal/repository"
	"blog-backend/internal/services"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

// Setup 初始化路由
func Setup(cfg *config.Config, db *gorm.DB, rdb *redis.Client) *gin.Engine {
	// 设置运行模式
	if cfg.Server.Mode == "release" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.Default()

	// CORS 跨域配置
	r.Use(cors.New(cors.Config{
		AllowOrigins:     cfg.CORS.Origins,
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	}))

	// 初始化 repositories
	userRepo := repository.NewUserRepository(db)
	workspaceRepo := repository.NewWorkspaceRepository(db)
	blockRepo := repository.NewBlockRepository(db)

	// 初始化 services
	authService := services.NewAuthService(userRepo, workspaceRepo, cfg, rdb, db)
	workspaceService := services.NewWorkspaceService(workspaceRepo)
	blockService := services.NewBlockService(blockRepo, rdb)

	// 初始化 handlers
	authHandler := handlers.NewAuthHandler(authService)
	workspaceHandler := handlers.NewWorkspaceHandler(workspaceService)
	blockHandler := handlers.NewBlockHandler(blockService)
	pageHandler := handlers.NewPageHandler(blockService)

	// 健康检查和版本信息
	r.GET("/api/health", handlers.HealthCheck(db, rdb)) // 健康检查接口，检查数据库和Redis是否正常
	r.GET("/api/version", handlers.Version)             // 版本信息接口，返回当前后端的版本号

	// 公开接口（无需认证）
	public := r.Group("/api/public")
	{
		// 按工作空间 ID 获取所有已发布的页面
		public.GET("/workspaces/:workspace_id/pages", pageHandler.GetPublicPages)
		// 根据 URL slug 获取指定公开页面的内容（包含其区块）
		public.GET("/workspaces/:workspace_id/pages/:slug/blocks", pageHandler.GetPageBySlug)
	}

	// 认证接口
	auth := r.Group("/api/auth")
	{
		auth.POST("/register", authHandler.Register)                             // 用户注册接口
		auth.POST("/login", authHandler.Login)                                   // 用户登录接口
		auth.POST("/refresh", authHandler.RefreshToken)                          // 刷新 Token 接口
		auth.POST("/logout", middleware.AuthMiddleware(cfg), authHandler.Logout) // 用户登出接口（需要认证）
		auth.GET("/me", middleware.AuthMiddleware(cfg), authHandler.Me)          // 获取当前登录用户信息接口（需要认证）
	}

	// 管理端接口（需要认证）
	admin := r.Group("/api/admin")
	admin.Use(middleware.AuthMiddleware(cfg))
	{
		// 工作空间管理
		workspaces := admin.Group("/workspaces")
		{
			workspaces.GET("", workspaceHandler.GetWorkspaces)          // 获取当前用户所属的所有工作空间列表
			workspaces.POST("", workspaceHandler.CreateWorkspace)       // 创建新的工作空间
			workspaces.GET("/:id", workspaceHandler.GetWorkspace)       // 获取特定工作空间的详细信息
			workspaces.PUT("/:id", workspaceHandler.UpdateWorkspace)    // 更新特定工作空间的信息
			workspaces.DELETE("/:id", workspaceHandler.DeleteWorkspace) // 删除特定的工作空间
		}

		// 页面管理（这里的 :id 对应原先的 :workspace_id，解决路由冲突）
		pages := admin.Group("/workspaces/:id/pages")
		pages.Use(middleware.WorkspaceMiddleware())
		{
			pages.GET("", pageHandler.GetAdminPages)     // 获取工作空间下所有页面（包含未发布的页面）
			pages.POST("", pageHandler.CreatePage)       // 在指定工作空间下创建新页面
			pages.PUT("/:id", pageHandler.UpdatePage)    // 更新指定页面（此处的 :id 为页面 ID）
			pages.DELETE("/:id", pageHandler.DeletePage) // 删除指定页面（此处的 :id 为页面 ID）
		}

		// Block 管理（这里的 :id 对应原先的 :workspace_id，解决路由冲突）
		blocks := admin.Group("/workspaces/:id/blocks")
		blocks.Use(middleware.WorkspaceMiddleware())
		{
			blocks.GET("/children", blockHandler.GetChildren) // 获取某个节点的直接子节点（侧边栏目录树）
			blocks.GET("/:page_id", blockHandler.GetBlocks)   // 获取指定页面下的所有内容区块
			blocks.POST("/sync", blockHandler.SyncBlocks)     // 批量同步（增量更新/删除）区块数据
		}
	}

	return r
}
