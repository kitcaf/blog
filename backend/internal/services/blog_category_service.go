package services

import (
	"blog-backend/internal/dto"
	"blog-backend/internal/models"
	categoryrepo "blog-backend/internal/repository/blogcategory"
	"blog-backend/pkg/errors"
	"blog-backend/pkg/utils"
	"context"
	"strings"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type BlogCategoryService struct {
	repo *categoryrepo.Repository
}

func NewBlogCategoryService(db *gorm.DB) *BlogCategoryService {
	return &BlogCategoryService{
		repo: categoryrepo.NewRepository(db),
	}
}

func (s *BlogCategoryService) ListCategories(userID uuid.UUID) ([]dto.BlogCategoryWithCount, error) {
	categories, err := s.repo.ListWithPostCount(userID)
	if err != nil {
		return nil, errors.Wrap(errors.ErrDatabaseQuery, err)
	}
	return categories, nil
}

func (s *BlogCategoryService) ListPublicCategories(ctx context.Context) ([]dto.BlogCategoryWithCount, error) {
	categories, err := s.repo.ListPublicWithPostCount(ctx)
	if err != nil {
		return nil, errors.Wrap(errors.ErrDatabaseQuery, err)
	}
	return categories, nil
}

func (s *BlogCategoryService) GetCategoryByID(userID, categoryID uuid.UUID) (*models.BlogCategory, error) {
	category, err := s.repo.FindByID(userID, categoryID)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, errors.New(errors.ErrCategoryNotFoundInternal, "category not found")
		}
		return nil, errors.Wrap(errors.ErrDatabaseQuery, err)
	}
	return category, nil
}

func (s *BlogCategoryService) FindPublicCategoryByID(ctx context.Context, categoryID uuid.UUID) (*models.BlogCategory, error) {
	category, err := s.repo.FindPublicByID(ctx, categoryID)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, errors.New(errors.ErrCategoryNotFoundInternal, "category not found")
		}
		return nil, errors.Wrap(errors.ErrDatabaseQuery, err)
	}
	return category, nil
}

func (s *BlogCategoryService) CreateCategory(
	userID uuid.UUID,
	name string,
	slug *string,
	description *string,
	sortOrder int,
) (*models.BlogCategory, error) {
	normalizedName, normalizedSlug, normalizedDescription, err := normalizeCategoryInput(name, slug, description, sortOrder)
	if err != nil {
		return nil, err
	}

	category := &models.BlogCategory{
		ID:          uuid.New(),
		CreatedBy:   &userID,
		Name:        normalizedName,
		Slug:        normalizedSlug,
		Description: normalizedDescription,
		SortOrder:   sortOrder,
	}

	if err := s.repo.Create(category); err != nil {
		return nil, translateCategoryPersistenceError(err)
	}

	return category, nil
}

func (s *BlogCategoryService) UpdateCategory(
	userID uuid.UUID,
	categoryID uuid.UUID,
	name string,
	slug *string,
	description *string,
	sortOrder int,
) (*models.BlogCategory, error) {
	existingCategory, err := s.repo.FindByID(userID, categoryID)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, errors.New(errors.ErrCategoryNotFoundInternal, "category not found")
		}
		return nil, errors.Wrap(errors.ErrDatabaseQuery, err)
	}

	normalizedName, normalizedSlug, normalizedDescription, err := normalizeCategoryInput(name, slug, description, sortOrder)
	if err != nil {
		return nil, err
	}

	existingCategory.Name = normalizedName
	existingCategory.Slug = normalizedSlug
	existingCategory.Description = normalizedDescription
	existingCategory.SortOrder = sortOrder

	if err := s.repo.Update(userID, existingCategory); err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, errors.New(errors.ErrCategoryNotFoundInternal, "category not found")
		}
		return nil, translateCategoryPersistenceError(err)
	}

	return existingCategory, nil
}

func (s *BlogCategoryService) DeleteCategory(userID, categoryID uuid.UUID) error {
	if err := s.repo.Delete(userID, categoryID); err != nil {
		if err == gorm.ErrRecordNotFound {
			return errors.New(errors.ErrCategoryNotFoundInternal, "category not found")
		}
		return errors.Wrap(errors.ErrDatabaseDelete, err)
	}
	return nil
}

func normalizeCategoryInput(
	name string,
	slug *string,
	description *string,
	sortOrder int,
) (string, string, *string, error) {
	normalizedName := strings.TrimSpace(name)
	if normalizedName == "" {
		return "", "", nil, errors.New(errors.ErrMissingRequired, "category name is required")
	}
	if sortOrder < 0 {
		return "", "", nil, errors.New(errors.ErrInvalidInput, "sort_order must be greater than or equal to 0")
	}

	var normalizedSlug string
	if slug == nil {
		normalizedSlug = utils.NormalizeSlug(normalizedName)
	} else {
		normalizedSlug = utils.NormalizeSlug(strings.TrimSpace(*slug))
	}
	if normalizedSlug == "" || !utils.ValidateSlug(normalizedSlug) {
		return "", "", nil, errors.New(errors.ErrInvalidSlugFormat, "invalid category slug")
	}

	var normalizedDescription *string
	if description != nil {
		trimmedDescription := strings.TrimSpace(*description)
		if trimmedDescription != "" {
			normalizedDescription = &trimmedDescription
		}
	}

	return normalizedName, normalizedSlug, normalizedDescription, nil
}

func translateCategoryPersistenceError(err error) error {
	if err == nil {
		return nil
	}

	errMessage := err.Error()
	switch {
	case containsAny(errMessage, "idx_blog_categories_user_name", "blog_categories_created_by_name"):
		return errors.New(errors.ErrCategoryNameExists, errMessage)
	case containsAny(errMessage, "idx_blog_categories_user_slug", "blog_categories_created_by_slug"):
		return errors.New(errors.ErrCategorySlugExists, errMessage)
	default:
		return errors.Wrap(errors.ErrDatabaseInsert, err)
	}
}
