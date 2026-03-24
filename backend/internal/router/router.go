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
func Setup(cfg *config.Config, db *gorm.DB, rdb *redis.Client, searchIndexer *services.SearchIndexer) *gin.Engine {
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
	blockRepo := repository.NewBlockRepository(db)

	// 初始化 services
	authService := services.NewAuthService(userRepo, cfg, rdb)
	blockService := services.NewBlockService(blockRepo, rdb)
	searchService := services.NewSearchService(db)

	// 设置搜索索引器到 BlockService（避免循环依赖）
	if searchIndexer != nil {
		blockService.SetSearchIndexer(searchIndexer)
	}

	// 初始化 handlers
	authHandler := handlers.NewAuthHandler(authService, blockService)
	blockHandler := handlers.NewBlockHandler(blockService)
	pageHandler := handlers.NewPageHandler(blockService)
	searchHandler := handlers.NewSearchHandler(searchService)
	trashHandler := handlers.NewTrashHandler(blockService)

	// 健康检查和版本信息
	r.GET("/api/health", handlers.HealthCheck(db, rdb))
	r.GET("/api/version", handlers.Version)

	// 公开接口（无需认证）
	public := r.Group("/api/public")
	{
		// 获取所有已发布的页面
		public.GET("/pages", pageHandler.GetPublicPages)
		// 根据 URL slug 获取指定公开页面的内容（包含其区块）
		public.GET("/pages/:slug/blocks", pageHandler.GetPageBySlug)
		// 搜索已发布的页面
		public.GET("/search", searchHandler.SearchPublicPages)
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
		// 搜索（管理后台）
		admin.GET("/search", searchHandler.SearchPages)

		// 页面管理
		pages := admin.Group("/pages")
		{
			pages.GET("", pageHandler.GetAdminPages)         // 获取所有页面（包含未发布）
			pages.POST("", pageHandler.CreatePage)           // 创建新页面
			pages.GET("/:id", pageHandler.GetPage)           // 获取单个页面详情
			pages.PUT("/:id", pageHandler.UpdatePage)        // 更新页面
			pages.DELETE("/:id", pageHandler.DeletePage)     // 删除页面
			pages.POST("/:id/move", pageHandler.MovePage)    // 移动页面到新位置
			pages.GET("/:id/blocks", blockHandler.GetBlocks) // 获取页面的所有 Block
		}

		// Block 管理
		blocks := admin.Group("/blocks")
		{
			blocks.GET("/tree", blockHandler.GetTree) // 获取目录树（?parent_id=xxx）
			blocks.PUT("", blockHandler.SyncBlocks)   // 批量更新 Block（RESTful 方式）
		}

		// 回收站管理
		trash := admin.Group("/trash")
		{
			trash.GET("", trashHandler.ListTrash)
			trash.POST("/batch-delete", trashHandler.BatchDeleteTrashItems)
			trash.POST("/:id/restore", trashHandler.RestoreTrashItem)
			trash.DELETE("/:id", trashHandler.DeleteTrashItem)
		}
	}

	return r
}
