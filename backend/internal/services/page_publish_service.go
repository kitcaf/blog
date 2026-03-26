package services

import (
	"blog-backend/internal/models"
	blockrepo "blog-backend/internal/repository/block"
	categoryrepo "blog-backend/internal/repository/blogcategory"
	"blog-backend/pkg/errors"
	"blog-backend/pkg/utils"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

const maxSlugGenerationAttempts = 10

type PageMetaPatch struct {
	DescriptionSet bool
	Description    *string
	TagsSet        bool
	Tags           []string
	CategorySet    bool
	CategoryID     *uuid.UUID
	SlugSet        bool
	Slug           *string
}

type PublishPageCommand struct {
	CategorySet bool
	CategoryID  *uuid.UUID
	TagsSet     bool
	Tags        []string
	SlugSet     bool
	Slug        *string
}

type PublishSubtreeCommand struct {
	CategorySet bool
	CategoryID  *uuid.UUID
	TagsSet     bool
	Tags        []string
}

type PagePublishService struct {
	db           *gorm.DB
	blockRepo    *blockrepo.BlockRepository
	categoryRepo *categoryrepo.Repository
	blockService *BlockService
}

func NewPagePublishService(db *gorm.DB, blockService *BlockService) *PagePublishService {
	return &PagePublishService{
		db:           db,
		blockRepo:    blockrepo.NewBlockRepository(db),
		categoryRepo: categoryrepo.NewRepository(db),
		blockService: blockService,
	}
}

func (s *PagePublishService) UpdatePageMeta(
	userID uuid.UUID,
	pageID uuid.UUID,
	patch PageMetaPatch,
) (*models.Block, error) {
	page, properties, err := s.loadEditablePage(userID, pageID)
	if err != nil {
		return nil, err
	}

	previousSlug := derefString(page.Slug)

	if patch.DescriptionSet {
		setOptionalStringProperty(properties, pagePropertyDescriptionKey, patch.Description)
	}
	if patch.TagsSet {
		setTagsProperty(properties, patch.Tags)
	}
	if patch.CategorySet {
		categoryID, categoryErr := s.resolveCategoryID(userID, patch.CategoryID)
		if categoryErr != nil {
			return nil, categoryErr
		}
		page.CategoryID = categoryID
	}
	if patch.SlugSet {
		resolvedSlug, slugErr := s.resolveManualSlug(patch.Slug, page.PublishedAt == nil, page.ID)
		if slugErr != nil {
			return nil, slugErr
		}
		page.Slug = resolvedSlug
	}

	encodedProperties, err := marshalPropertiesMap(properties)
	if err != nil {
		return nil, errors.Wrap(errors.ErrDatabaseUpdate, err)
	}
	page.Properties = encodedProperties

	if err := s.blockRepo.Update(userID, page); err != nil {
		return nil, translatePagePersistenceError(err)
	}

	if page.PublishedAt != nil {
		s.blockService.InvalidatePublishedContentCaches(uniqueNonEmptySlugs(previousSlug, derefString(page.Slug))...)
	}

	return page, nil
}

func (s *PagePublishService) PublishPage(
	userID uuid.UUID,
	pageID uuid.UUID,
	command PublishPageCommand,
) (*models.PublishPageResult, error) {
	page, properties, err := s.loadEditablePage(userID, pageID)
	if err != nil {
		return nil, err
	}

	previousSlug := derefString(page.Slug)

	if command.CategorySet {
		categoryID, categoryErr := s.resolveCategoryID(userID, command.CategoryID)
		if categoryErr != nil {
			return nil, categoryErr
		}
		page.CategoryID = categoryID
	}
	if command.TagsSet {
		setTagsProperty(properties, command.Tags)
	}

	if command.SlugSet {
		resolvedSlug, slugErr := s.resolveManualSlug(command.Slug, false, page.ID)
		if slugErr != nil {
			return nil, slugErr
		}
		page.Slug = resolvedSlug
	} else if page.Slug == nil {
		generatedSlug, generateErr := s.generateUniquePageSlug(getPageTitle(properties), page.ID, nil)
		if generateErr != nil {
			return nil, generateErr
		}
		page.Slug = &generatedSlug
	}

	if page.PublishedAt == nil {
		now := time.Now().UTC()
		page.PublishedAt = &now
	}

	encodedProperties, err := marshalPropertiesMap(properties)
	if err != nil {
		return nil, errors.Wrap(errors.ErrDatabaseUpdate, err)
	}
	page.Properties = encodedProperties

	if err := s.blockRepo.Update(userID, page); err != nil {
		return nil, translatePagePersistenceError(err)
	}

	s.blockService.InvalidatePublishedContentCaches(uniqueNonEmptySlugs(previousSlug, derefString(page.Slug))...)
	s.blockService.ReindexPublishedPage(userID, page.ID)

	return &models.PublishPageResult{
		PageID:      page.ID,
		Slug:        derefString(page.Slug),
		PublishedAt: *page.PublishedAt,
		PreviewURL:  "/blog/" + derefString(page.Slug),
	}, nil
}

func (s *PagePublishService) UnpublishPage(userID uuid.UUID, pageID uuid.UUID) error {
	page, _, err := s.loadEditablePage(userID, pageID)
	if err != nil {
		return err
	}

	previousSlug := derefString(page.Slug)
	page.PublishedAt = nil

	if err := s.blockRepo.Update(userID, page); err != nil {
		return translatePagePersistenceError(err)
	}

	s.blockService.InvalidatePublishedContentCaches(previousSlug)
	s.blockService.ReindexPublishedPage(userID, page.ID)
	return nil
}

func (s *PagePublishService) PublishSubtree(
	userID uuid.UUID,
	rootID uuid.UUID,
	command PublishSubtreeCommand,
) (*models.PublishSubtreeResult, error) {
	var (
		result     *models.PublishSubtreeResult
		cacheSlugs []string
		rootPath   string
	)

	err := s.db.Transaction(func(tx *gorm.DB) error {
		txBlockRepo := blockrepo.NewBlockRepository(tx)
		txCategoryRepo := categoryrepo.NewRepository(tx)

		rootBlock, findErr := txBlockRepo.FindByID(userID, rootID)
		if findErr != nil {
			if findErr == gorm.ErrRecordNotFound {
				return errors.New(errors.ErrPageNotFoundInternal, "publish subtree root not found")
			}
			return errors.Wrap(errors.ErrDatabaseQuery, findErr)
		}
		if rootBlock.Type != "folder" {
			return errors.New(errors.ErrInvalidInput, "publish subtree target must be a folder")
		}

		rootPath = rootBlock.Path

		var categoryID *uuid.UUID
		if command.CategorySet {
			if command.CategoryID != nil {
				if _, categoryErr := txCategoryRepo.FindByID(userID, *command.CategoryID); categoryErr != nil {
					if categoryErr == gorm.ErrRecordNotFound {
						return errors.New(errors.ErrCategoryNotFoundInternal, "category not found")
					}
					return errors.Wrap(errors.ErrDatabaseQuery, categoryErr)
				}
				categoryID = command.CategoryID
			}
		}

		pages, listErr := txBlockRepo.FindPagesInSubtree(userID, rootPath)
		if listErr != nil {
			return errors.Wrap(errors.ErrDatabaseQuery, listErr)
		}

		reservedSlugs := make(map[string]struct{}, len(pages))
		publishedCount := 0
		for index := range pages {
			page := &pages[index]

			properties, parseErr := parsePropertiesMap(page.Properties)
			if parseErr != nil {
				return errors.Wrap(errors.ErrDatabaseQuery, parseErr)
			}

			if command.TagsSet {
				setTagsProperty(properties, command.Tags)
			}
			if command.CategorySet {
				page.CategoryID = categoryID
			}

			if page.Slug == nil {
				generatedSlug, generateErr := s.generateUniquePageSlug(getPageTitle(properties), page.ID, reservedSlugs)
				if generateErr != nil {
					return generateErr
				}
				page.Slug = &generatedSlug
			} else {
				reservedSlugs[derefString(page.Slug)] = struct{}{}
			}

			if page.PublishedAt == nil {
				now := time.Now().UTC()
				page.PublishedAt = &now
			}

			encodedProperties, marshalErr := marshalPropertiesMap(properties)
			if marshalErr != nil {
				return errors.Wrap(errors.ErrDatabaseUpdate, marshalErr)
			}
			page.Properties = encodedProperties

			if updateErr := txBlockRepo.Update(userID, page); updateErr != nil {
				return translatePagePersistenceError(updateErr)
			}

			cacheSlugs = append(cacheSlugs, derefString(page.Slug))
			publishedCount++
		}

		result = &models.PublishSubtreeResult{
			RootID:          rootID,
			PublishedCount:  publishedCount,
			SkippedCount:    0,
			EffectiveTagSet: normalizeTags(command.Tags),
		}

		return nil
	})
	if err != nil {
		return nil, err
	}

	s.blockService.InvalidatePublishedContentCaches(cacheSlugs...)
	s.blockService.ReindexPublishedSubtree(userID, rootPath)

	return result, nil
}

func (s *PagePublishService) loadEditablePage(userID uuid.UUID, pageID uuid.UUID) (*models.Block, map[string]interface{}, error) {
	page, err := s.blockRepo.FindByID(userID, pageID)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil, errors.New(errors.ErrPageNotFoundInternal, "page not found")
		}
		return nil, nil, errors.Wrap(errors.ErrDatabaseQuery, err)
	}
	if page.Type != "page" {
		return nil, nil, errors.New(errors.ErrInvalidInput, "target block is not a page")
	}

	properties, err := parsePropertiesMap(page.Properties)
	if err != nil {
		return nil, nil, errors.Wrap(errors.ErrDatabaseQuery, err)
	}

	return page, properties, nil
}

func (s *PagePublishService) resolveCategoryID(userID uuid.UUID, categoryID *uuid.UUID) (*uuid.UUID, error) {
	if categoryID == nil {
		return nil, nil
	}

	if _, err := s.categoryRepo.FindByID(userID, *categoryID); err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, errors.New(errors.ErrCategoryNotFoundInternal, "category not found")
		}
		return nil, errors.Wrap(errors.ErrDatabaseQuery, err)
	}

	return categoryID, nil
}

func (s *PagePublishService) resolveManualSlug(
	requestedSlug *string,
	allowClear bool,
	pageID uuid.UUID,
) (*string, error) {
	if requestedSlug == nil {
		if allowClear {
			return nil, nil
		}
		return nil, errors.New(errors.ErrInvalidSlugFormat, "slug is required")
	}

	normalizedSlug := utils.NormalizeSlug(strings.TrimSpace(*requestedSlug))
	if normalizedSlug == "" {
		if allowClear {
			return nil, nil
		}
		return nil, errors.New(errors.ErrInvalidSlugFormat, "slug cannot be empty")
	}
	if !utils.ValidateSlug(normalizedSlug) {
		return nil, errors.New(errors.ErrInvalidSlugFormat, "invalid slug format")
	}

	exists, err := s.blockRepo.SlugExists(normalizedSlug, &pageID)
	if err != nil {
		return nil, errors.Wrap(errors.ErrDatabaseQuery, err)
	}
	if exists {
		return nil, errors.New(errors.ErrSlugAlreadyExists, "slug already exists")
	}

	return &normalizedSlug, nil
}

func (s *PagePublishService) generateUniquePageSlug(
	title string,
	pageID uuid.UUID,
	reservedSlugs map[string]struct{},
) (string, error) {
	for attempt := 0; attempt < maxSlugGenerationAttempts; attempt++ {
		candidate := utils.GenerateSlug(title)

		if reservedSlugs != nil {
			if _, exists := reservedSlugs[candidate]; exists {
				continue
			}
		}

		exists, err := s.blockRepo.SlugExists(candidate, &pageID)
		if err != nil {
			return "", errors.Wrap(errors.ErrDatabaseQuery, err)
		}
		if exists {
			continue
		}

		if reservedSlugs != nil {
			reservedSlugs[candidate] = struct{}{}
		}
		return candidate, nil
	}

	return "", errors.New(errors.ErrSlugAlreadyExists, "failed to generate unique slug")
}

func translatePagePersistenceError(err error) error {
	if err == nil {
		return nil
	}

	if containsAny(err.Error(), "idx_blocks_slug_unique", "duplicate key") {
		return errors.New(errors.ErrSlugAlreadyExists, err.Error())
	}

	return errors.Wrap(errors.ErrDatabaseUpdate, err)
}

func uniqueNonEmptySlugs(values ...string) []string {
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		if _, exists := seen[trimmed]; exists {
			continue
		}
		seen[trimmed] = struct{}{}
		result = append(result, trimmed)
	}
	return result
}
