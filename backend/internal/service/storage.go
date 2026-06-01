package service

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/XinFinOrg/XDCStats/backend/internal/models"
)

const dbName = "forensics"
const collectionName = "forensics"
const cacheKey = "recentForensics"

type ForensicsStorage struct {
	coll  *mongo.Collection
	mu    sync.RWMutex
	cache []ForensicsSummary // simple in-memory cache for latest 30
}

func NewForensicsStorage(client *mongo.Client) *ForensicsStorage {
	coll := client.Database(dbName).Collection(collectionName)
	return &ForensicsStorage{coll: coll}
}

type ForensicsSummary struct {
	Key                    string    `json:"key"`
	EventTime              time.Time `json:"eventTime"`
	ForensicsType          string    `json:"forensicsType"`
	AffectedBlockNum       interface{} `json:"affectedBlockNum"`
	SuspiciousNodes        []string  `json:"suspeciousNodes"`
	NumberOfSuspiciousNodes int      `json:"numberOfSuspeciousNodes"`
}

type ForensicsDetail struct {
	Key           string      `json:"key"`
	EventTime     time.Time   `json:"eventTime"`
	ForensicsType string      `json:"forensicsType"`
	Details       interface{} `json:"details"`
	TimeSinceLastEvent int64  `json:"timeSinceLastEvent,omitempty"`
}

func (s *ForensicsStorage) Save(proof json.RawMessage) error {
	var p struct {
		ID            string `json:"id"`
		ForensicsType string `json:"forensicsType"`
		Content       interface{} `json:"content"`
	}
	if err := json.Unmarshal(proof, &p); err != nil {
		return err
	}
	if p.ID == "" {
		return errors.New("forensics proof missing id")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Skip duplicates
	count, err := s.coll.CountDocuments(ctx, bson.D{{Key: "_id", Value: p.ID}})
	if err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	contentJSON, _ := json.Marshal(p.Content)
	doc := models.Forensics{
		ID:            p.ID,
		ForensicsType: p.ForensicsType,
		EventTime:     time.Now(),
		Content:       string(contentJSON),
	}

	if _, err := s.coll.InsertOne(ctx, doc); err != nil {
		return err
	}
	slog.Info("forensics saved", "id", p.ID)
	s.mu.Lock()
	s.cache = nil // invalidate cache
	s.mu.Unlock()
	return nil
}

func (s *ForensicsStorage) BulkGetSummaries(since *time.Time) ([]ForensicsSummary, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	filter := bson.D{}
	if since != nil {
		filter = bson.D{{Key: "eventTime", Value: bson.D{{Key: "$gte", Value: *since}}}}
	}

	opts := options.Find().SetSort(bson.D{{Key: "eventTime", Value: -1}})
	cursor, err := s.coll.Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var results []ForensicsSummary
	for cursor.Next(ctx) {
		var doc models.Forensics
		if err := cursor.Decode(&doc); err != nil {
			continue
		}
		if s, err := toSummary(doc); err == nil {
			results = append(results, s)
		}
	}
	return results, cursor.Err()
}

func (s *ForensicsStorage) BulkGetLatest() ([]ForensicsSummary, error) {
	s.mu.RLock()
	if s.cache != nil {
		cached := s.cache
		s.mu.RUnlock()
		return cached, nil
	}
	s.mu.RUnlock()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	opts := options.Find().SetSort(bson.D{{Key: "eventTime", Value: -1}}).SetLimit(30)
	cursor, err := s.coll.Find(ctx, bson.D{}, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var results []ForensicsSummary
	for cursor.Next(ctx) {
		var doc models.Forensics
		if err := cursor.Decode(&doc); err != nil {
			continue
		}
		if sum, err := toSummary(doc); err == nil {
			results = append(results, sum)
		}
	}
	if err := cursor.Err(); err != nil {
		return nil, err
	}

	s.mu.Lock()
	s.cache = results
	s.mu.Unlock()
	return results, nil
}

func (s *ForensicsStorage) FindByID(id string) (*ForensicsDetail, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var doc models.Forensics
	err := s.coll.FindOne(ctx, bson.D{{Key: "_id", Value: id}}).Decode(&doc)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	detail, err := toDetail(doc)
	if err != nil {
		return nil, err
	}

	// Find previous event for timeSinceLastEvent
	opts := options.FindOne().SetSort(bson.D{{Key: "_id", Value: -1}})
	filter := bson.D{{Key: "_id", Value: bson.D{{Key: "$lt", Value: id}}}}
	var prev models.Forensics
	if err := s.coll.FindOne(ctx, filter, opts).Decode(&prev); err == nil {
		detail.TimeSinceLastEvent = int64(doc.EventTime.Sub(prev.EventTime).Seconds())
	}
	return detail, nil
}

func toSummary(doc models.Forensics) (ForensicsSummary, error) {
	var content map[string]interface{}
	if err := json.Unmarshal([]byte(doc.Content), &content); err != nil {
		return ForensicsSummary{}, err
	}
	nodes, blockNum := extractSummaryFields(content, doc.ForensicsType)
	return ForensicsSummary{
		Key:                     doc.ID,
		EventTime:               doc.EventTime,
		ForensicsType:           doc.ForensicsType,
		AffectedBlockNum:        blockNum,
		SuspiciousNodes:         nodes,
		NumberOfSuspiciousNodes: len(nodes),
	}, nil
}

func toDetail(doc models.Forensics) (*ForensicsDetail, error) {
	var content map[string]interface{}
	if err := json.Unmarshal([]byte(doc.Content), &content); err != nil {
		return nil, err
	}
	details := buildDetails(content, doc.ForensicsType)
	return &ForensicsDetail{
		Key:           doc.ID,
		EventTime:     doc.EventTime,
		ForensicsType: doc.ForensicsType,
		Details:       details,
	}, nil
}

func extractSummaryFields(content map[string]interface{}, fType string) ([]string, interface{}) {
	switch fType {
	case "QC":
		smallerRound, _ := content["smallerRoundInfo"].(map[string]interface{})
		if smallerRound == nil {
			return nil, nil
		}
		signers, _ := toStringSlice(smallerRound["signerAddresses"])
		var blockNum interface{}
		if qc, ok := smallerRound["quorumCert"].(map[string]interface{}); ok {
			if bi, ok := qc["ProposedBlockInfo"].(map[string]interface{}); ok {
				blockNum = bi["Number"]
			}
		}
		return signers, blockNum
	case "Vote":
		signer, _ := content["signer"].(string)
		var blockNum interface{}
		if vote, ok := content["smallerRoundVote"].(map[string]interface{}); ok {
			if bi, ok := vote["ProposedBlockInfo"].(map[string]interface{}); ok {
				blockNum = bi["Number"]
			}
		}
		if signer != "" {
			return []string{signer}, blockNum
		}
		return nil, blockNum
	}
	return nil, nil
}

func buildDetails(content map[string]interface{}, fType string) interface{} {
	switch fType {
	case "QC":
		smallerRound, _ := content["smallerRoundInfo"].(map[string]interface{})
		largerRound, _ := content["largerRoundInfo"].(map[string]interface{})
		nodes, _ := extractSummaryFields(content, fType)
		attackType := "ATTACK"
		if v, ok := content["acrossEpoch"].(bool); ok && v {
			attackType = "PRONE_TO_NETWORK"
		}
		return map[string]interface{}{
			"suspeciousNodes":       nodes,
			"attackType":            attackType,
			"divergingBlockNumber":  content["divergingBlockNumber"],
			"divergingBlockHash":    content["divergingBlockHash"],
			"fork1":                 smallerRound,
			"fork2":                 largerRound,
		}
	case "Vote":
		nodes, _ := extractSummaryFields(content, fType)
		return map[string]interface{}{
			"suspeciousNodes": nodes,
			"attackType":      "ATTACK",
			"vote1":           content["smallerRoundVote"],
			"vote2":           content["largerRoundVote"],
		}
	}
	return nil
}

func toStringSlice(v interface{}) ([]string, bool) {
	arr, ok := v.([]interface{})
	if !ok {
		return nil, false
	}
	result := make([]string, 0, len(arr))
	for _, item := range arr {
		if s, ok := item.(string); ok {
			result = append(result, s)
		}
	}
	return result, true
}
