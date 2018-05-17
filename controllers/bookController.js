var Book = require('../models/book');
var Author = require('../models/author');
var Genre = require('../models/genre');
var BookInstance = require('../models/bookinstance');
const util = require('util');
const { check, body, validationResult } = require('express-validator/check');
const { sanitizeBody, sanitizeParam } = require('express-validator/filter');

var async = require('async');

exports.index = function(req, res) {

    async.parallel({
        book_count: function(callback) {
            Book.count({}, callback); // Pass an empty object as match condition to find all documents of this collection
        },
        book_instance_count: function(callback) {
            BookInstance.count({}, callback);
        },
        book_instance_available_count: function(callback) {
            BookInstance.count({status:'Available'}, callback);
        },
        author_count: function(callback) {
            Author.count({}, callback);
        },
        genre_count: function(callback) {
            Genre.count({}, callback);
        },
    }, function(err, results) {
        res.render('index', { title: 'Local Library Home', error: err, data: results });
    });
};

// Display list of all Books.
exports.book_list = function(req, res, next) {

  Book.find({}, 'title author')
    .populate('author')
    .exec(function (err, list_books) {
      if (err) { return next(err); }
      //Successful, so render
      res.render('book_list', { title: 'Book List', book_list: list_books });
    });

};

// Display detail page for a specific book.
exports.book_detail = function(req, res, next) {

    async.parallel({
        book: function(callback) {

            Book.findById(req.params.id)
              .populate('author')
              .populate('genre')
              .exec(callback);
        },
        book_instance: function(callback) {

          BookInstance.find({ 'book': req.params.id })
          .exec(callback);
        },
    }, function(err, results) {
        if (err) { return next(err); }
        if (results.book==null) { // No results.
            var err = new Error('Book not found');
            err.status = 404;
            return next(err);
        }
        // Successful, so render.
        res.render('book_detail', { title: 'Title',
          book:  results.book, book_instances: results.book_instance } );
    });

};

// Display book create form on GET.
exports.book_create_get = function(req, res, next) {

    // Get all authors and genres, which we can use for adding to our book.
    async.parallel({
        authors: function(callback) {
            Author.find(callback);
        },
        genres: function(callback) {
            Genre.find(callback);
        },
    }, function(err, results) {
        if (err) { return next(err); }
        res.render('book_form', { title: 'Create Book',
          authors: results.authors, genres: results.genres });
    });

};

// Handle book create on POST.
exports.book_create_post = [
    // Convert the genre to an array.
    (req, res, next) => {
        if(!(req.body.genre instanceof Array)){
            if(typeof req.body.genre==='undefined')
            req.body.genre=[];
            else
            req.body.genre=new Array(req.body.genre);
        }
        next();
    },

    // Validate fields.
    body('title', 'Title must not be empty.').isLength({ min: 1 }).trim(),
    body('author', 'Author must not be empty.').isLength({ min: 1 }).trim(),
    body('summary', 'Summary must not be empty.').isLength({ min: 1 }).trim(),
    body('isbn', 'ISBN must not be empty').isLength({ min: 1 }).trim(),

    // Sanitize fields (using wildcard).
    sanitizeBody('*').trim().escape(),

    // Process request after validation and sanitization.
    (req, res, next) => {

        // Extract the validation errors from a request.
        const errors = validationResult(req);

        // Create a Book object with escaped and trimmed data.
        var book = new Book(
          { title: req.body.title,
            author: req.body.author,
            summary: req.body.summary,
            isbn: req.body.isbn,
            genre: req.body.genre
           });

        if (!errors.isEmpty()) {
            // There are errors. Render form again with sanitized values/error messages.

            // Get all authors and genres for form.
            async.parallel({
                authors: function(callback) {
                    Author.find(callback);
                },
                genres: function(callback) {
                    Genre.find(callback);
                },
            }, function(err, results) {
                if (err) { return next(err); }

                // Mark our selected genres as checked.
                for (let i = 0; i < results.genres.length; i++) {
                    if (book.genre.indexOf(results.genres[i]._id) > -1) {
                        results.genres[i].checked='true';
                    }
                }
                res.render('book_form', { title: 'Create Book',
                  authors:results.authors,
                  genres:results.genres,
                  book: book,
                  errors: errors.array()
                });
            });
            return;
        }
        else {
            // Data from form is valid. Save book.
            book.save(function (err) {
                if (err) { return next(err); }
                   //successful - redirect to new book record.
                   res.redirect(book.url);
                });
        }
    }
];

// Display book delete form on GET.
exports.book_delete_get = function(req, res) {
    res.send('NOT IMPLEMENTED: Book delete GET');
};

// Handle book delete on POST.
exports.book_delete_post = function(req, res) {
    res.send('NOT IMPLEMENTED: Book delete POST');
};


// Display book update form on GET.
exports.book_update_get = (req, res) => {
    sanitizeParam(req.params.id);
    Promise.all([
      Book.findById(req.params.id)
      .populate('genre')
      .populate('author')
      .exec(),
      Genre.find().exec()
    ]).
    then((result) => {
      //Find and mark genres from general list
      for (let i = 0; i < result[1].length; i++) {
        for (let book_genre of result[0].genre) {
          if (result[1][i].name === book_genre.name) {
            result[1][i].checked = true;
          }
        }
      }
      res.render('book_update', {book: result[0],
        genres: result[1],
        error_obj: null});
    }).
    catch((err) => {console.log(err); return next(err);});
  };



// Handle book update on POST.
exports.book_update_post = [

    //sanitizeBody('*').trim(),

    check('title')
    .isLength({min: 3, max: 100}).withMessage('Title can not be shorter than \
    3 and longer than 100 characters'),

    check('summary')
    .isLength({min: undefined, max: 500})
    .withMessage('Summary cannot be longer than 500 characters'),

    check('isbn')
    .isISBN()
    .withMessage('Invalid ISBN'),

    (req, res, next) => {
      let errors = validationResult(req);

      if(!(req.body.genre instanceof Array)){
            if(typeof req.body.genre==='undefined')
            req.body.genre=[];
            else
            req.body.genre=new Array(req.body.genre);
          }

          ///
          Promise.all([
            Book.findById(req.params.id)
              .populate('genre').populate('author').exec(),
              Genre.find().exec()
          ])
          .then(

            (result) => {

            result[0].title = req.body.title;
            result[0].summary = req.body.summary;
            result[0].isbn = req.body.isbn;
            result[0].genre = req.body.genre;
            var book_save = result[0];
            //Find and mark genres from general list
            for (let i = 0; i < result[1].length; i++) {
              for (let book_genre of result[0].genre) {
                if (result[1][i].id == book_genre) {
                  result[1][i].checked = true;
                }
              }
            }
              if (!errors.isEmpty()) {
                  error_obj = errors.mapped();
                  res.render('book_update', {book: result[0],
                              genres: result[1], error: error_obj});
                }
                else {
                  book_save.save((err) => {
                    if(err) {
                      console.log(err);
                      return;
                    }
                    res.redirect(book_save.url);
                  });
                }
            }).catch((err) => {console.log(err); return next(err);});



      }
]
