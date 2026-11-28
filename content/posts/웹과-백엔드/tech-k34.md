---
title: "데이터베이스의 키와 트랜잭션 정리"
date: 2025-01-08
draft: false
slug: "tech-k34"
categories:
  - "웹과 백엔드"
tags:
  - "workflow"
summary: "게시글과 댓글 테이블을 예로 들어 기본 키와 외래 키로 데이터의 연결 관계를 지키는 방식과, 트랜잭션으로 여러 저장 작업을 묶어 일부만 저장되는 문제를 막는 원리를 정리한다."
cover: ""
canonical: ""
comments: false
notion_id: "3dbdcd44-779f-8170-a55d-fbd6d610a433"
generated_by: "notion"
---
게시판 서비스를 만들 때는 게시글과 댓글처럼 서로 연결된 데이터를 두 개의 표, 즉 테이블(table)에 나누어 저장한다. 이때 없는 게시글에 댓글이 달리거나, 게시글과 첫 댓글을 연달아 저장하다가 중간에 오류가 나서 게시글만 남는 문제가 생길 수 있다.


이 글에서는 PostgreSQL 데이터베이스를 기준으로 데이터를 바르게 연결하고 안전하게 저장하는 두 가지 장치를 정리한다. 데이터의 연결 관계를 지키는 기본 키와 외래 키, 여러 작업을 하나로 묶는 트랜잭션이 각각 어떻게 동작하는지 차례대로 확인한다.


## 테이블의 기본 키와 외래 키


관계형 데이터베이스에서 테이블은 같은 구조를 가진 가로줄인 행(row)과 세로줄인 열(column)로 데이터를 모아 두는 단위다. 먼저 게시글 번호와 제목, 본문을 담아 둘 `posts` 테이블을 다음과 같이 만든다.


```sql
CREATE TABLE posts (
  post_id  INTEGER PRIMARY KEY,
  title    VARCHAR(200) NOT NULL,
  body     TEXT
);
```


위 코드에서 `posts` 테이블은 게시글 번호인 `post_id`, 제목인 `title`, 본문인 `body` 세 열로 이루어진다. 그중 `post_id` 옆에 적은 `PRIMARY KEY`는 테이블 안에서 각 행을 유일하게 식별하는 **기본 키**(PRIMARY KEY)다. 기본 키로 지정한 열에는 이미 존재하는 값을 중복해서 넣을 수 없고, 빈 값인 `NULL`도 허용되지 않는다.


PostgreSQL에서 기본 키를 선언하면 내부적으로 B-tree 구조의 고유 인덱스(unique index)가 자동 생성된다([CREATE TABLE — PostgreSQL 공식 문서](https://www.postgresql.org/docs/current/sql-createtable.html)). 인덱스는 값을 빠르게 찾기 위한 색인 구조여서, 특정 `post_id`로 게시글을 조회할 때 테이블 전체를 처음부터 끝까지 훑지 않아도 된다.


게시글 테이블을 준비했으니 이어서 게시글에 달리는 댓글을 저장할 `comments` 테이블을 만든다. 댓글은 어느 게시글에 속하는지 알아야 하므로 `posts` 테이블의 게시글 번호를 참조해야 한다.


```sql
CREATE TABLE comments (
  comment_id  INTEGER PRIMARY KEY,
  post_id     INTEGER NOT NULL REFERENCES posts(post_id),
  content     TEXT NOT NULL
);
```


위 코드의 `REFERENCES posts(post_id)`가 다른 테이블의 열을 가리키는 **외래 키**(FOREIGN KEY)다. 외래 키를 걸어 두면 `posts` 테이블에 없는 `post_id` 값을 `comments`에 넣으려 할 때 데이터베이스가 저장을 거부한다. 반대로 댓글이 달린 게시글을 삭제하려 해도 기본 설정(`NO ACTION`)에서는 거부된다. 이처럼 없는 대상을 가리키거나 참조 중인 대상이 사라져 데이터 관계가 깨지는 일을 막는 규칙이 **참조 무결성**(referential integrity)이다.


![posts 테이블의 post_id 기본 키를 comments 테이블의 외래 키가 참조할 때 존재하는 값만 허용되고 없는 값은 거부되는 구조](/images/notion/tech-k34/image-1.png)


그림 1. 기본 키(PRIMARY KEY)와 외래 키(FOREIGN KEY)를 통한 참조 무결성 검사 개념도.


## 네 가지 데이터 기본 조작


테이블과 키로 데이터 구조를 준비하고 나면 행을 넣고 읽고 고치고 지우는 기본 조작을 수행할 수 있다. 기본 조작은 추가(Create), 조회(Read), 수정(Update), 삭제(Delete) 네 가지로 나뉘며 앞 글자를 따서 CRUD라고 묶어 부른다.


| 조작     | SQL 예시                                                 | 의미   |
| ------ | ------------------------------------------------------ | ---- |
| Create | `INSERT INTO posts (post_id, title) VALUES (1, '첫 글')` | 행 추가 |
| Read   | `SELECT * FROM posts WHERE post_id = 1`                | 행 조회 |
| Update | `UPDATE posts SET title = '수정된 제목' WHERE post_id = 1`  | 행 변경 |
| Delete | `DELETE FROM posts WHERE post_id = 1`                  | 행 삭제 |


단일 행을 하나씩 추가하거나 조회할 때는 기본 키와 외래 키 제약만으로도 잘못된 참조가 들어가는 일을 막을 수 있다. 하지만 두 테이블에 걸친 쓰기 작업이 각각 따로 확정될 때는 중간에 오류가 나면 키 제약만으로 막지 못하는 상태가 남는다.


## 연속된 쓰기와 부분 저장 문제


두 테이블에 데이터를 연달아 쓰는 예로, 새 게시글과 그 게시글에 달린 첫 댓글을 함께 저장하는 상황을 본다. 데이터베이스에서 변경을 최종 확정하는 일을 커밋(commit)이라고 하며, 문장마다 변경을 즉시 확정하는 설정을 자동 커밋(autocommit)이라고 한다. 자동 커밋 상태에서 두 `INSERT` 문을 순서대로 실행하면 첫 번째 문장은 바로 확정된다. 그 직후 두 번째 `INSERT`가 `NOT NULL` 제약 위반 등으로 거부되면 데이터베이스에는 댓글 없는 게시글만 남는다.


![클라이언트가 posts와 comments 테이블에 순서대로 행을 추가할 때 두 번째 추가가 실패하면 댓글 없는 게시글만 남는 흐름도](/images/notion/tech-k34/image-2.png)


그림 2. 두 INSERT를 별도 트랜잭션으로 커밋할 때의 실패 경로 (설명용 흐름도).


만약 SQL 오류 대신 네트워크가 끊겼다면 댓글이 저장된 뒤 응답만 유실됐을 가능성도 있어 저장 결과를 다시 조회해 확인해야 한다. 외래 키 제약은 댓글이 참조하는 게시글이 존재하는지만 검사할 뿐, 댓글 없는 게시글은 허용한다. 하지만 게시글과 첫 댓글을 반드시 함께 저장해야 한다는 업무 규칙이 있다면 이처럼 절반만 완료된 상태가 문제가 된다. 애플리케이션 코드에서 두 번째 `INSERT`가 실패했을 때 첫 번째 `INSERT`를 되돌리는 `DELETE` 문을 실행할 수도 있다. 그러나 그때 실행한 `DELETE`마저 실패할 가능성은 여전히 남는다.


## 트랜잭션과 원자성


여러 쓰기 작업 중 일부만 반영되는 문제를 데이터베이스 수준에서 해결하는 장치가 **트랜잭션**(transaction)이다. PostgreSQL에서 `BEGIN` 없이 SQL을 실행하면 각 문장을 개별 트랜잭션으로 자동 감싸서 실행하는 자동 커밋 모드로 동작한다([BEGIN — PostgreSQL 공식 문서](https://www.postgresql.org/docs/current/sql-begin.html)). 이 상태에서는 첫 번째 `INSERT`가 즉시 커밋된 뒤 두 번째 `INSERT`가 실패하므로 절반만 남는 상태가 생긴다.


두 작업을 하나로 묶으려면 `BEGIN`으로 트랜잭션을 열고 두 `INSERT` 문을 차례대로 실행한다. 모든 명령이 성공하면 `COMMIT`으로 확정하고, 하나라도 실패하면 `ROLLBACK`으로 전부 취소한다([Transactions — PostgreSQL 공식 문서](https://www.postgresql.org/docs/current/tutorial-transactions.html)).


```sql
BEGIN;

INSERT INTO posts (post_id, title, body)
  VALUES (1, '첫 글', '본문입니다');

INSERT INTO comments (comment_id, post_id, content)
  VALUES (1, 1, '첫 댓글입니다');

COMMIT;
```


위 코드처럼 `COMMIT`까지 정상 실행되면 게시글과 첫 댓글이 함께 확정된다. 다만 `COMMIT` 이후에 네트워크 오류로 응답이 유실되면 이미 확정되었을 수 있으므로 저장 결과 조회와 재시도 정책으로 완료 여부를 확인해야 한다.


반대로 커밋 전에 두 번째 `INSERT`가 실패하면 `ROLLBACK`을 실행해 첫 번째 변경까지 취소할 수 있다. 취소가 끝나면 `posts` 테이블에는 앞서 넣었던 `post_id = 1` 행이 남지 않는다. 이처럼 묶인 작업이 모두 반영되거나 하나도 반영되지 않는 성질을 **원자성**(atomicity)이라고 한다.


![클라이언트가 BEGIN 이후 posts 추가에 성공하고 comments 추가에서 ERROR를 받은 뒤 ROLLBACK을 보내 두 변경을 모두 취소하는 시퀀스 다이어그램](/images/notion/tech-k34/image-3.png)


그림 3. 트랜잭션 안에서 두 번째 쓰기가 실패한 경우: ROLLBACK으로 첫 번째도 취소 (설명용 시퀀스).


## 동시 연결과 격리 수준


트랜잭션이 진행되는 동안 다른 데이터베이스 연결인 세션(session)이 같은 테이블을 조회할 수도 있다. 이때 아직 확정되지 않은 중간 상태를 다른 세션에서 볼 수 있는지 정하는 기준이 **격리 수준**(isolation level)이다. PostgreSQL의 기본 격리 수준은 확정된 변경만 읽는 `READ COMMITTED`다. 따라서 한 세션이 트랜잭션을 열고 `post_id = 1`을 추가했더라도 아직 커밋하지 않았다면 다른 세션에서는 해당 행이 보이지 않는다.


![세션 A가 트랜잭션을 열고 post_id = 1을 추가했지만 아직 커밋하지 않았을 때 READ COMMITTED 격리 수준의 세션 B에서는 해당 행이 조회되지 않는 모습](/images/notion/tech-k34/image-4.png)


그림 4. READ COMMITTED 격리 수준에서 커밋 전 변경이 다른 세션에 보이지 않는 동작 개념도.


`REPEATABLE READ`나 `SERIALIZABLE`처럼 더 강한 격리 수준은 여러 세션의 동시 접근이 실제로 문제를 일으키는 상황에서 다룰 대상이다.


## 결론


기본 키와 외래 키는 행을 식별하고 테이블 사이의 참조 관계가 맞는지 검사해 참조 무결성을 지키는 규칙이다. 반면 트랜잭션은 여러 쓰기 작업을 하나로 묶어 중간에 실패했을 때 앞선 변경을 함께 취소해 원자성을 보장하는 장치다. 데이터가 어긋나지 않게 저장하려면 참조 무결성과 원자성이 각각 맡는 역할을 구분해 적용해야 한다.


이번 글에서는 한 세션 안에서 두 `INSERT`를 연달아 실행할 때의 실패 처리와 기본 격리 수준인 `READ COMMITTED`를 다뤘다. 여러 세션이 동시에 쓰기를 수행할 때 필요한 더 강한 격리 수준과, 수정 중인 행을 다른 세션이 바꾸지 못하게 막는 잠금(lock)은 이번 글에서 다루지 않았다. 두 세션이 동시에 같은 행을 `UPDATE`할 때 어떤 순서로 처리되고 잠금이 언제 풀리는지는 다음 주제로 이어서 다룬다.


---


**참고 문서**

- [CREATE TABLE — PostgreSQL 공식 문서](https://www.postgresql.org/docs/current/sql-createtable.html)
- [Transactions — PostgreSQL 공식 문서](https://www.postgresql.org/docs/current/tutorial-transactions.html)
- [BEGIN — PostgreSQL 공식 문서](https://www.postgresql.org/docs/current/sql-begin.html)

## 함께 읽기


이어 읽을 글: [명함 CMS의 미리보기와 배포 과정](https://blog.namuori.net/posts/tech-11-05/), [엑셀 표 변환과 셀 배치 정리](https://blog.namuori.net/posts/tech-12-05/), [Spring 게시판의 입력 검사와 작성자 권한](https://blog.namuori.net/posts/tech-13-01/), [HanQuote의 문장 수집과 정적 페이지 갱신](https://blog.namuori.net/posts/tech-13-03/)
