import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.model_selection import train_test_split, GridSearchCV, cross_val_score
from sklearn.preprocessing import LabelEncoder, OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix

sns.set_style("whitegrid")
plt.rcParams["figure.dpi"] = 110

df = pd.read_csv("/mnt/user-data/uploads/StudentsPerformance.csv")
df.columns = [c.strip() for c in df.columns]

# ---------- Feature engineering ----------
df["average_score"] = df[["math score", "reading score", "writing score"]].mean(axis=1)

def perf_label(avg):
    if avg >= 80:
        return "High"
    elif avg >= 60:
        return "Medium"
    else:
        return "Low"

df["performance"] = df["average_score"].apply(perf_label)

# Engineered interaction features (still leakage-free: no exam score used to predict performance)
df["parent_edu_lunch"] = df["parental level of education"] + "_" + df["lunch"]
df["prep_lunch"] = df["test preparation course"] + "_" + df["lunch"]
df["race_parent_edu"] = df["race/ethnicity"] + "_" + df["parental level of education"]

print("Performance class distribution:")
print(df["performance"].value_counts())
print()

# ---------- EDA plots ----------
fig, axes = plt.subplots(2, 2, figsize=(13, 10))

sns.histplot(df["average_score"], bins=20, kde=True, color="#4C72B0", ax=axes[0, 0])
axes[0, 0].set_title("Distribution of Average Score")

sns.boxplot(data=df, x="test preparation course", y="average_score",
            hue="test preparation course", palette="Set2", legend=False, ax=axes[0, 1])
axes[0, 1].set_title("Average Score by Test Prep Course")

sns.boxplot(data=df, x="parental level of education", y="average_score",
            hue="parental level of education", palette="Set3", legend=False, ax=axes[1, 0])
axes[1, 0].set_title("Average Score by Parental Education")
axes[1, 0].tick_params(axis="x", rotation=40)

perf_counts = df["performance"].value_counts().reindex(["Low", "Medium", "High"])
axes[1, 1].bar(perf_counts.index, perf_counts.values, color=["#C44E52", "#DD8452", "#55A868"])
axes[1, 1].set_title("Performance Category Counts")

plt.tight_layout()
plt.savefig("/home/claude/eda_overview.png", bbox_inches="tight")
plt.close()

# Correlation heatmap of numeric scores + gender/lunch encodings
fig, ax = plt.subplots(figsize=(6, 5))
corr = df[["math score", "reading score", "writing score", "average_score"]].corr()
sns.heatmap(corr, annot=True, cmap="coolwarm", fmt=".2f", ax=ax)
ax.set_title("Correlation Between Scores")
plt.tight_layout()
plt.savefig("/home/claude/correlation_heatmap.png", bbox_inches="tight")
plt.close()

# ---------- Prepare data for modeling ----------
# Predict performance category from demographic/categorical features + engineered
# interaction features only (still leakage-free: no exam score is used to predict
# the performance label derived from exam scores)
feature_cols = ["gender", "race/ethnicity", "parental level of education",
                 "lunch", "test preparation course",
                 "parent_edu_lunch", "prep_lunch", "race_parent_edu"]

X = df[feature_cols].copy()
y = df["performance"].copy()

y_le = LabelEncoder()
y_enc = y_le.fit_transform(y)

X_train, X_test, y_train, y_test = train_test_split(
    X, y_enc, test_size=0.2, random_state=42, stratify=y_enc
)

# One-hot encode all categorical features (better for Logistic Regression than
# label encoding, and doesn't hurt tree models)
preprocessor = ColumnTransformer(
    transformers=[("cat", OneHotEncoder(handle_unknown="ignore"), feature_cols)]
)

# ---------- Models ----------
results = {}
fitted_pipelines = {}

# Logistic Regression with class weighting (handles class imbalance) + CV
lr_pipe = Pipeline([
    ("prep", preprocessor),
    ("clf", LogisticRegression(max_iter=2000))
])
lr_cv = cross_val_score(lr_pipe, X_train, y_train, cv=5).mean()
lr_pipe.fit(X_train, y_train)
pred_lr = lr_pipe.predict(X_test)
acc_lr = accuracy_score(y_test, pred_lr)
results["Logistic Regression"] = acc_lr
fitted_pipelines["Logistic Regression"] = lr_pipe
print(f"Logistic Regression - 5-fold CV: {lr_cv*100:.2f}% | Test: {acc_lr*100:.2f}%")

# Random Forest with grid-searched hyperparameters
rf_pipe = Pipeline([
    ("prep", preprocessor),
    ("clf", RandomForestClassifier(random_state=42))
])
rf_grid = {
    "clf__n_estimators": [200, 400],
    "clf__max_depth": [4, 6, 8, None],
    "clf__min_samples_leaf": [1, 3, 5],
}
rf_search = GridSearchCV(rf_pipe, rf_grid, cv=5, n_jobs=-1)
rf_search.fit(X_train, y_train)
pred_rf = rf_search.predict(X_test)
acc_rf = accuracy_score(y_test, pred_rf)
results["Random Forest"] = acc_rf
fitted_pipelines["Random Forest"] = rf_search
print(f"Random Forest    - Best CV: {rf_search.best_score_*100:.2f}% | Test: {acc_rf*100:.2f}% | Params: {rf_search.best_params_}")

# Gradient Boosting
gb_pipe = Pipeline([
    ("prep", preprocessor),
    ("clf", GradientBoostingClassifier(random_state=42, n_estimators=200,
                                        max_depth=3, learning_rate=0.05))
])
gb_cv = cross_val_score(gb_pipe, X_train, y_train, cv=5).mean()
gb_pipe.fit(X_train, y_train)
pred_gb = gb_pipe.predict(X_test)
acc_gb = accuracy_score(y_test, pred_gb)
results["Gradient Boosting"] = acc_gb
fitted_pipelines["Gradient Boosting"] = gb_pipe
print(f"Gradient Boosting - 5-fold CV: {gb_cv*100:.2f}% | Test: {acc_gb*100:.2f}%")
print()

majority_acc = (df["performance"] == df["performance"].mode()[0]).mean()
print(f"Majority-class baseline accuracy: {majority_acc*100:.2f}%")
print()

print("Model accuracy on held-out test set:")
for name, acc in results.items():
    print(f"  {name}: {acc*100:.2f}%")
print()

best_name = max(results, key=results.get)
best_pipeline = fitted_pipelines[best_name]
best_pred = best_pipeline.predict(X_test)

print(f"Best model: {best_name} ({results[best_name]*100:.2f}%)")
print()
print(classification_report(y_test, best_pred, target_names=y_le.classes_))

# ---------- Model comparison + confusion matrix + feature importance plots ----------
fig, axes = plt.subplots(1, 3, figsize=(17, 5))

colors = ["#4C72B0", "#55A868", "#C44E52"]
axes[0].bar(results.keys(), [v * 100 for v in results.values()], color=colors)
axes[0].axhline(majority_acc * 100, color="gray", linestyle="--", label=f"Baseline ({majority_acc*100:.1f}%)")
axes[0].set_ylabel("Accuracy (%)")
axes[0].set_title("Model Accuracy Comparison")
axes[0].set_ylim(0, 100)
axes[0].legend()
for i, v in enumerate(results.values()):
    axes[0].text(i, v * 100 + 1, f"{v*100:.1f}%", ha="center")
axes[0].tick_params(axis="x", rotation=15)

cm = confusion_matrix(y_test, best_pred)
sns.heatmap(cm, annot=True, fmt="d", cmap="Blues",
            xticklabels=y_le.classes_, yticklabels=y_le.classes_, ax=axes[1])
axes[1].set_title(f"Confusion Matrix ({best_name})")
axes[1].set_xlabel("Predicted")
axes[1].set_ylabel("Actual")

# Feature importance from the Random Forest (works whether or not it's the best model)
rf_best = rf_search.best_estimator_.named_steps["clf"]
ohe_names = rf_search.best_estimator_.named_steps["prep"].get_feature_names_out()
importances = rf_best.feature_importances_
top_idx = np.argsort(importances)[-10:]
axes[2].barh(np.array(ohe_names)[top_idx], importances[top_idx], color="#DD8452")
axes[2].set_title("Top 10 Feature Importances (Random Forest)")

plt.tight_layout()
plt.savefig("/home/claude/model_results.png", bbox_inches="tight")
plt.close()

print("\nSaved: eda_overview.png, correlation_heatmap.png, model_results.png")
