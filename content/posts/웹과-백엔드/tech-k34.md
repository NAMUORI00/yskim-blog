---
title: "데이터베이스의 키와 트랜잭션 정리"
date: 2025-01-08
draft: false
slug: "tech-k34"
categories:
  - "웹과 백엔드"
tags:
  - "workflow"
summary: "게시글과 댓글 테이블을 예제로 키와 트랜잭션을 정리했다. 댓글이 실제 게시글을 참조하는 조건과 두 저장을 함께 확정하는 조건은 다르다. 행의 관계와 변경의 묶음을 나누어 코드 흐름을 살펴봤다."
cover: ""
canonical: ""
comments: false
notion_id: "3dbdcd44-779f-8170-a55d-fbd6d610a433"
generated_by: "notion"
---
## 관련된 두 행의 저장 처리


게시글과 댓글 테이블을 예제로 키와 트랜잭션을 정리했다. 댓글이 실제 게시글을 참조하는 조건과 두 저장을 함께 확정하는 조건은 다르다. 행의 관계와 변경의 묶음을 나누어 코드 흐름을 살펴봤다.


## 테이블과 키: 행을 식별하고 관계를 걸어 두는 장치


관계형 데이터베이스에서 테이블은 같은 구조의 행을 모아 두는 단위다. 게시글 테이블을 하나 만들어 본다.


```sql
CREATE TABLE posts (
  post_id  INTEGER PRIMARY KEY,
  title    VARCHAR(200) NOT NULL,
  body     TEXT
);
```


`PRIMARY KEY`는 각 행을 유일하게 식별하는 열을 지정한다. 같은 `post_id` 값을 가진 행을 두 번 넣을 수 없고, NULL도 허용되지 않는다.


PostgreSQL은 PRIMARY KEY를 선언하면 내부적으로 B-tree 유니크 인덱스를 자동 생성한다([CREATE TABLE — PostgreSQL 공식 문서](https://www.postgresql.org/docs/current/sql-createtable.html)). 이 인덱스 덕분에 특정 `post_id`로 행을 찾을 때 테이블 전체를 훑지 않아도 된다.


댓글 테이블은 게시글을 참조해야 한다.


```sql
CREATE TABLE comments (
  comment_id  INTEGER PRIMARY KEY,
  post_id     INTEGER NOT NULL REFERENCES posts(post_id),
  content     TEXT NOT NULL
);
```


`REFERENCES posts(post_id)`가 외래 키(FOREIGN KEY)다. `posts`에 없는 `post_id`를 `comments`에 넣으면 데이터베이스가 거부한다.


반대로 댓글이 달린 게시글을 삭제하려 해도 기본 설정(`NO ACTION`)에서는 거부된다. 이 동작이 참조 무결성(referential integrity)이며, 데이터 사이의 관계가 깨지지 않도록 데이터베이스 수준에서 막아 주는 것이다.


## CRUD: 네 가지 기본 조작


테이블이 준비되면 행에 대해 할 수 있는 조작은 네 가지로 정리된다.


| 조작     | SQL 예시                                                 | 의미   |
| ------ | ------------------------------------------------------ | ---- |
| Create | `INSERT INTO posts (post_id, title) VALUES (1, '첫 글')` | 행 추가 |
| Read   | `SELECT * FROM posts WHERE post_id = 1`                | 행 조회 |
| Update | `UPDATE posts SET title = '수정된 제목' WHERE post_id = 1`  | 행 변경 |
| Delete | `DELETE FROM posts WHERE post_id = 1`                  | 행 삭제 |


행의 생성, 조회, 수정, 삭제를 CRUD로 묶어 부른다. 여기서는 두 테이블의 쓰기가 각각 확정될 때 중간 실패가 어떤 상태를 남기는지 비교했다.


## 개별 커밋과 부분 저장


게시글을 넣고, 이어서 그 게시글에 달린 첫 댓글을 함께 넣으려 한다. 두 문장이 각각 자동 커밋되는 연결에서 순서대로 실행하면 어떤 경로가 생기는지 그려 보면:


![K34-01.png](/images/notion/tech-k34/image-1.png)


그림 1. 두 INSERT를 별도 트랜잭션으로 커밋할 때의 실패 경로 (설명용 흐름도)


두 번째 INSERT가 NOT NULL 제약 위반 등으로 거부되면 게시글만 남을 수 있다. 네트워크가 끊기면 댓글 저장 후 응답만 유실됐을 가능성도 있어 저장 결과를 다시 조회해야 한다.


애플리케이션 코드에서 첫 번째 INSERT를 되돌리는 DELETE를 실행할 수도 있지만, 그 DELETE마저 실패할 가능성은 여전히 남는다. 게시글과 첫 댓글을 함께 저장해야 한다는 업무 규칙이라면 이런 부분 완료가 문제가 된다. 외래 키 제약은 댓글이 참조하는 게시글의 존재를 검사하며, 댓글 없는 게시글은 허용한다.


## 트랜잭션의 시작과 롤백


이 문제를 데이터베이스 수준에서 해결하는 장치가 트랜잭션이다. `BEGIN`으로 열고, 모든 명령이 성공하면 `COMMIT`으로 확정하고, 하나라도 실패하면 `ROLLBACK`으로 전부 취소한다([Transactions — PostgreSQL 공식 문서](https://www.postgresql.org/docs/current/tutorial-transactions.html)).


```sql
BEGIN;

INSERT INTO posts (post_id, title, body)
  VALUES (1, '첫 글', '본문입니다');

INSERT INTO comments (comment_id, post_id, content)
  VALUES (1, 1, '첫 댓글입니다');

COMMIT;
```


커밋 전 두 번째 INSERT가 실패한 경우에는 ROLLBACK으로 첫 번째 변경도 취소할 수 있다. 이 경우 `posts`에 `post_id = 1` 행이 남지 않는다. COMMIT 이후 응답이 유실되면 저장 결과 조회와 재시도 정책으로 완료 여부를 확인해야 한다. 아래 흐름은 커밋 전 실패의 예다.


![K34-02.png](/images/notion/tech-k34/image-2.png)


그림 2. 트랜잭션 안에서 두 번째 쓰기가 실패한 경우: ROLLBACK으로 첫 번째도 취소 (설명용 시퀀스)


이 "전부 아니면 전무"가 원자성(atomicity)이다. `BEGIN` 없이 SQL을 실행하면 PostgreSQL은 각 문장을 개별 트랜잭션으로 자동 감싸서 실행하는데(autocommit 모드), 이 경우 첫 번째 INSERT가 커밋된 뒤 두 번째가 실패하므로 절반만 남는 상태가 생기는 것이다([BEGIN — PostgreSQL 공식 문서](https://www.postgresql.org/docs/current/sql-begin.html)).


트랜잭션이 진행되는 동안 다른 세션에서 중간 상태를 볼 수 있는지 여부는 격리 수준(isolation level)에 따라 달라진다. PostgreSQL의 기본 격리 수준은 READ COMMITTED로, 커밋되지 않은 변경은 다른 세션에서 보이지 않는다.


REPEATABLE READ나 SERIALIZABLE 같은 더 강한 격리 수준은 동시 접근이 실제로 문제를 일으키는 시점에 살펴볼 대상이다.


## 추가로 정리할 내용


두 테이블의 PRIMARY KEY, FOREIGN KEY와 두 INSERT를 묶는 트랜잭션을 살펴봤다. 참조가 맞는지 검사하는 규칙과 중간 실패에서 변경을 함께 취소하는 규칙이 각각 맡는 역할을 정리할 수 있었다.


두 세션이 같은 행을 UPDATE할 때의 처리 순서와 잠금 해제 시점은 다음 주제로 남겼다. 원자성에 이어 동시 쓰기의 잠금과 격리 수준을 함께 살펴볼 내용이다.


---


**참고 문서**

- [CREATE TABLE — PostgreSQL 공식 문서](https://www.postgresql.org/docs/current/sql-createtable.html)
- [Transactions — PostgreSQL 공식 문서](https://www.postgresql.org/docs/current/tutorial-transactions.html)
- [BEGIN — PostgreSQL 공식 문서](https://www.postgresql.org/docs/current/sql-begin.html)

## 함께 읽기


이어 읽을 글: [명함 CMS의 미리보기와 배포 과정](https://blog.namuori.net/posts/tech-11-05/), [엑셀 표 변환과 셀 배치 정리](https://blog.namuori.net/posts/tech-12-05/), [Spring 게시판의 입력 검사와 수정 권한](https://blog.namuori.net/posts/tech-13-01/), [HanQuote의 문장 수집과 정적 페이지 갱신](https://blog.namuori.net/posts/tech-13-03/)
